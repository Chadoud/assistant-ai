/**
 * BrainMapScene — imperative three.js renderer for the brain map.
 *
 * Owns the WebGL canvas, orbit navigation (rotate / zoom / pan), node
 * dragging, hover picking, and the per-frame force-layout stepping. Pure
 * rendering + input: graph data comes from graphModel, physics from
 * ForceLayout3D, and UI (labels, inspector) is delegated to React through
 * the constructor callbacks.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ForceLayout3D } from "./forceLayout3d";
import type { BrainGraph, BrainNode, BrainNodeKind } from "./graphModel";
import { CONVERSATIONS_HUB_ID, isLayoutAnchor, isMapHubNode } from "./graphModel";
import {
  clearBrainMapLayout,
  pruneBrainMapLayout,
  readBrainMapLayout,
  saveBrainMapAnchorPlacement,
} from "./brainMapLayoutStore";

interface SceneCallbacks {
  /** Hovered node (or null) with pointer position in container coordinates. */
  onHover: (node: BrainNode | null, x: number, y: number) => void;
  /** Clicked node, or null when clicking empty space. */
  onSelect: (node: BrainNode | null) => void;
}

const CAMERA_FOV = 55;
const DRAG_CLICK_THRESHOLD_PX = 5;
/** Lerp factor per frame while dragging — higher = snappier pointer tracking. */
const DRAG_SMOOTHING = 0.34;
const EDGE_OPACITY = 0.32;
const DUST_COUNT = 260;
const HOVER_SCALE = 1.45;
const OVERVIEW_WARMUP_STEPS = 120;
/** Margin around the graph's bounding sphere; lower = tighter fill. */
const OVERVIEW_PADDING = 0.88;
/** Pleasant default orbit angle — slightly above and in front of the graph center. */
const OVERVIEW_DIRECTION = new THREE.Vector3(0.12, 0.34, 1).normalize();
/** Reusable scratch vectors for fitToOverview (avoid per-frame allocations). */
const _fitCenter = new THREE.Vector3();
const _fitSphere = new THREE.Sphere();
/** Unit cube half-extent 1 — matches prior SphereGeometry(1) scaling. */
const NODE_BOX_SIZE = 2;
const NODE_FACE_DARK = 0x060d18;

interface NodeVisual {
  group: THREE.Group;
  faceMaterial: THREE.MeshStandardMaterial;
  edgeMaterial: THREE.LineBasicMaterial;
}

interface DragFollower {
  index: number;
  dx: number;
  dy: number;
  dz: number;
}

export class BrainMapScene {
  private readonly container: HTMLDivElement;
  private readonly callbacks: SceneCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver;

  private layout: ForceLayout3D;
  private currentGraph: BrainGraph | null = null;
  private graphNodes: BrainNode[] = [];
  private indexById = new Map<string, number>();
  private nodeVisuals: NodeVisual[] = [];
  private nodeBoxGeometry: THREE.BoxGeometry | null = null;
  private nodeEdgesGeometry: THREE.EdgesGeometry | null = null;
  private edgeGeometry: THREE.BufferGeometry | null = null;
  private edgeLines: THREE.LineSegments | null = null;

  private rafId = 0;
  private hoveredIndex: number | null = null;
  private draggedIndex: number | null = null;
  private dragFollowers: DragFollower[] = [];
  private activePointerId: number | null = null;
  private dragMoved = false;
  private dragHighlightIndices: number[] = [];
  private readonly dragPlane = new THREE.Plane();
  private readonly dragPoint = new THREE.Vector3();
  private readonly dragTarget = new THREE.Vector3();
  private dragTargetActive = false;
  private readonly dragPlaneNormal = new THREE.Vector3();
  private pointerDownAt: { x: number; y: number } | null = null;
  private pointerDownIndex: number | null = null;
  private focusTarget: THREE.Vector3 | null = null;
  private searchQuery = "";
  private kindFilter: Set<BrainNodeKind> | null = null;
  private hubOnlyView = true;
  private expandedHubId: string | null = null;
  private childrenById = new Map<string, string[]>();
  private disposed = false;
  private userAdjustedView = false;
  /** While true, the camera re-frames the whole graph each frame as it settles. */
  private autoFraming = true;

  /** Dim nodes whose label/detail do not match the query (empty query resets all). */
  setSearchQuery(query: string): void {
    this.searchQuery = query.trim().toLowerCase();
    this.applyNodeVisibility();
  }

  /** Highlight only selected node kinds; null or empty shows everything. */
  setKindFilter(kinds: BrainNodeKind[] | null): void {
    this.kindFilter = kinds && kinds.length > 0 ? new Set(kinds) : null;
    this.applyNodeVisibility();
  }

  /** When true, only hub nodes are visible until a hub is expanded. */
  setHubOnlyView(enabled: boolean): void {
    this.hubOnlyView = enabled;
    if (enabled) this.expandedHubId = null;
    this.applyNodeVisibility();
    if (enabled) this.fitToOverview();
  }

  /** Reveal one hub cluster while staying in hub-first mode. */
  expandHub(hubId: string | null): void {
    this.expandedHubId = hubId;
    this.hubOnlyView = true;
    this.applyNodeVisibility();
    if (hubId) this.focusNode(hubId);
  }

  private rebuildAdjacency(links: BrainGraph["links"]): void {
    this.childrenById.clear();
    for (const link of links) {
      const list = this.childrenById.get(link.source) ?? [];
      list.push(link.target);
      this.childrenById.set(link.source, list);
    }
  }

  private descendantIds(rootId: string): Set<string> {
    const out = new Set<string>([rootId]);
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const child of this.childrenById.get(id) ?? []) {
        if (!out.has(child)) {
          out.add(child);
          stack.push(child);
        }
      }
    }
    return out;
  }

  private nodeVisibleInHubView(node: BrainNode): boolean {
    if (!this.hubOnlyView) return true;
    if (isMapHubNode(node)) return true;
    if (!this.expandedHubId) return false;
    return this.descendantIds(this.expandedHubId).has(node.id);
  }

  private nodeMatchesKindFilter(node: BrainNode): boolean {
    if (!this.kindFilter) return true;
    if (this.kindFilter.has(node.kind)) return true;
    if (this.kindFilter.has("file") && (node.kind === "folder" || node.id === "hub:files")) {
      return true;
    }
    if (
      this.kindFilter.has("memory") &&
      node.kind === "category" &&
      node.id.startsWith("hub:") &&
      node.id !== "hub:tasks" &&
      node.id !== "hub:files"
    ) {
      return true;
    }
    if (this.kindFilter.has("task") && node.id === "hub:tasks") {
      return true;
    }
    if (this.kindFilter.has("conversation") && node.id === CONVERSATIONS_HUB_ID) {
      return true;
    }
    return false;
  }

  private applyNodeVisibility(): void {
    const q = this.searchQuery;
    for (let i = 0; i < this.nodeVisuals.length; i++) {
      const { group, faceMaterial, edgeMaterial } = this.nodeVisuals[i];
      const node = this.graphNodes[i];
      const matchesSearch =
        !q ||
        node.label.toLowerCase().includes(q) ||
        node.detail.toLowerCase().includes(q);
      const matchesKind = this.nodeMatchesKindFilter(node);
      const matchesHub = this.nodeVisibleInHubView(node);
      const matches = matchesSearch && matchesKind && matchesHub;
      faceMaterial.opacity = matches ? 0.92 : 0.22;
      faceMaterial.transparent = true;
      faceMaterial.emissiveIntensity = matches ? 0.35 : 0.08;
      edgeMaterial.opacity = matches ? 0.95 : 0.28;
      edgeMaterial.transparent = true;
      group.visible = true;
    }
    if (this.edgeLines) {
      const dimmed = Boolean(q) || Boolean(this.kindFilter) || this.hubOnlyView;
      (this.edgeLines.material as THREE.LineBasicMaterial).opacity = dimmed ? 0.12 : EDGE_OPACITY;
    }
  }

  constructor(container: HTMLDivElement, graph: BrainGraph, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.layout = new ForceLayout3D(graph);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      2000,
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 40;
    this.controls.maxDistance = 600;
    // Omi-style map stays still until the user orbits; auto-spin felt like the graph
    // was "retracting" or drifting away on its own.
    this.controls.autoRotate = false;
    this.controls.addEventListener("start", () => {
      this.focusTarget = null;
      this.userAdjustedView = true;
    });

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const keyLight = new THREE.PointLight(0xffffff, 1200);
    keyLight.position.set(80, 120, 160);
    this.scene.add(keyLight);

    this.buildGraphObjects(graph);
    this.addDust();
    this.warmLayoutAndFitOverview();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    canvas.addEventListener("lostpointercapture", this.handleLostPointerCapture);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);

    this.animate();
  }

  /** Swap in a new graph (data refresh) without recreating the canvas. */
  setGraph(graph: BrainGraph): void {
    this.clearGraphObjects();
    this.layout = new ForceLayout3D(graph);
    this.userAdjustedView = false;
    this.autoFraming = true;
    this.buildGraphObjects(graph);
    this.warmLayoutAndFitOverview();
  }

/** Clear saved positions and re-run auto layout (Reset layout). */
  resetUserLayout(): void {
    if (!this.currentGraph) return;
    clearBrainMapLayout();
    this.layout = new ForceLayout3D(this.currentGraph);
    this.userAdjustedView = false;
    this.autoFraming = true;
    this.warmLayoutAndFitOverview();
  }

  /** Re-frame the camera so every node is visible (overview). */
  fitToOverview(): void {
    if (this.graphNodes.length === 0) return;

    const box = new THREE.Box3();
    for (let i = 0; i < this.layout.nodes.length; i++) {
      const p = this.layout.nodes[i];
      const half = (this.graphNodes[i]?.radius ?? 3) * (NODE_BOX_SIZE / 2);
      box.expandByPoint(new THREE.Vector3(p.x + half, p.y + half, p.z + half));
      box.expandByPoint(new THREE.Vector3(p.x - half, p.y - half, p.z - half));
    }
    if (box.isEmpty()) return;

    const center = box.getCenter(_fitCenter);
    const sphere = box.getBoundingSphere(_fitSphere);
    const radius = sphere.radius * OVERVIEW_PADDING;

    const fovRad = (this.camera.fov * Math.PI) / 180;
    const aspect = Math.max(this.camera.aspect, 0.01);
    const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
    // Fit the bounding sphere in both vertical and horizontal FOV — use the tighter axis.
    const distance = Math.max(
      radius / Math.tan(fovRad / 2),
      radius / Math.tan(hFovRad / 2),
    );

    this.camera.position.copy(center).add(OVERVIEW_DIRECTION.clone().multiplyScalar(distance));
    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(24, distance * 0.12);
    this.controls.maxDistance = Math.max(800, distance * 3.5);
    this.controls.update();
  }

  private warmLayoutAndFitOverview(): void {
    this.layout.warmUp(OVERVIEW_WARMUP_STEPS);
    this.applySavedUserPlacements();
    this.syncPositions();
    this.fitToOverview();
  }

  private applySavedUserPlacements(): void {
    const anchorIds = new Set(
      this.graphNodes.filter((n) => isLayoutAnchor(n)).map((n) => n.id),
    );
    const allNodeIds = new Set(this.graphNodes.map((n) => n.id));
    pruneBrainMapLayout(anchorIds, allNodeIds);
    this.layout.applySavedPlacements(readBrainMapLayout());
    this.layout.attachUnsetDirectChildren(this.childrenById);
    this.syncPositions();
  }

  private descendantIndices(anchorId: string): number[] {
    const ids = this.descendantIds(anchorId);
    const indices: number[] = [];
    for (const id of ids) {
      if (id === anchorId) continue;
      const idx = this.indexById.get(id);
      if (idx !== undefined) indices.push(idx);
    }
    return indices;
  }

  private beginAnchorDrag(anchorIndex: number): DragFollower[] {
    const anchor = this.layout.nodes[anchorIndex];
    const anchorId = this.graphNodes[anchorIndex].id;
    const followers: DragFollower[] = [];
    for (const childIndex of this.descendantIndices(anchorId)) {
      const child = this.layout.nodes[childIndex];
      followers.push({
        index: childIndex,
        dx: child.x - anchor.x,
        dy: child.y - anchor.y,
        dz: child.z - anchor.z,
      });
      child.fixed = true;
    }
    anchor.fixed = true;
    this.layout.reheat(0.42);
    return followers;
  }

  private updateDragPlaneThroughAnchor(anchorIndex: number): void {
    const p = this.layout.nodes[anchorIndex];
    this.camera.getWorldDirection(this.dragPlaneNormal).negate();
    this.dragPlane.setFromNormalAndCoplanarPoint(
      this.dragPlaneNormal,
      new THREE.Vector3(p.x, p.y, p.z),
    );
  }

  private tickDragMotion(): void {
    if (this.draggedIndex === null || !this.dragTargetActive) return;
    const anchor = this.layout.nodes[this.draggedIndex];
    const t = DRAG_SMOOTHING;
    const nx = anchor.x + (this.dragTarget.x - anchor.x) * t;
    const ny = anchor.y + (this.dragTarget.y - anchor.y) * t;
    const nz = anchor.z + (this.dragTarget.z - anchor.z) * t;
    this.moveAnchorDrag(this.draggedIndex, nx, ny, nz);
  }

  private snapDragToTarget(): void {
    if (this.draggedIndex === null || !this.dragTargetActive) return;
    this.moveAnchorDrag(
      this.draggedIndex,
      this.dragTarget.x,
      this.dragTarget.y,
      this.dragTarget.z,
    );
  }

  private moveAnchorDrag(anchorIndex: number, x: number, y: number, z: number): void {
    const anchor = this.layout.nodes[anchorIndex];
    anchor.x = x;
    anchor.y = y;
    anchor.z = z;
    for (const follower of this.dragFollowers) {
      const child = this.layout.nodes[follower.index];
      child.x = x + follower.dx;
      child.y = y + follower.dy;
      child.z = z + follower.dz;
    }
  }

  private commitAnchorDrag(anchorIndex: number): void {
    const anchorId = this.graphNodes[anchorIndex].id;
    const anchor = this.layout.nodes[anchorIndex];
    const childOffsets: Record<string, { dx: number; dy: number; dz: number }> = {};
    for (const follower of this.dragFollowers) {
      childOffsets[this.graphNodes[follower.index].id] = {
        dx: follower.dx,
        dy: follower.dy,
        dz: follower.dz,
      };
    }
    this.layout.commitUserPlacedCluster(anchorIndex, this.dragFollowers);
    saveBrainMapAnchorPlacement(anchorId, {
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      childOffsets,
    });
  }

  private setDragHighlight(indices: number[]): void {
    for (const index of this.dragHighlightIndices) {
      if (!indices.includes(index)) {
        this.setNodeEmissive(index, 0.35);
      }
    }
    this.dragHighlightIndices = indices;
    for (const index of indices) {
      this.setNodeEmissive(index, 0.85);
    }
  }

  private clearDragHighlight(): void {
    this.setDragHighlight([]);
  }

  private releasePointerCapture(): void {
    if (this.activePointerId === null) return;
    try {
      this.renderer.domElement.releasePointerCapture(this.activePointerId);
    } catch {
      /* pointer may already be released */
    }
    this.activePointerId = null;
  }

  private finishAnchorDrag(index: number, commit: boolean): void {
    if (commit) {
      this.snapDragToTarget();
      this.commitAnchorDrag(index);
    } else {
      const anchor = this.layout.nodes[index];
      anchor.fixed = anchor.userPlaced;
      for (const follower of this.dragFollowers) {
        const child = this.layout.nodes[follower.index];
        child.fixed = child.userPlaced;
      }
    }
    this.draggedIndex = null;
    this.dragFollowers = [];
    this.dragMoved = false;
    this.dragTargetActive = false;
    this.clearDragHighlight();
    this.releasePointerCapture();
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = "";
    this.syncPositions();
  }

  /** Smoothly move the orbit target onto a node (used on select). */
  focusNode(nodeId: string): void {
    const index = this.graphNodes.findIndex((n) => n.id === nodeId);
    if (index < 0) return;
    const p = this.layout.nodes[index];
    this.focusTarget = new THREE.Vector3(p.x, p.y, p.z);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    canvas.removeEventListener("lostpointercapture", this.handleLostPointerCapture);
    canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.controls.dispose();
    this.clearGraphObjects();
    this.scene.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Points ||
        obj instanceof THREE.LineSegments
      ) {
        obj.geometry.dispose();
        const material = obj.material as THREE.Material | THREE.Material[];
        (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    canvas.remove();
  }

  // ── Scene construction ────────────────────────────────────────────────────

  private buildGraphObjects(graph: BrainGraph): void {
    this.currentGraph = graph;
    this.graphNodes = graph.nodes;
    this.indexById = new Map(graph.nodes.map((n, i) => [n.id, i]));
    this.rebuildAdjacency(graph.links);
    const box = new THREE.BoxGeometry(NODE_BOX_SIZE, NODE_BOX_SIZE, NODE_BOX_SIZE);
    const edges = new THREE.EdgesGeometry(box);
    this.nodeBoxGeometry = box;
    this.nodeEdgesGeometry = edges;

    this.nodeVisuals = graph.nodes.map((node, index) => {
      const faceMaterial = new THREE.MeshStandardMaterial({
        color: NODE_FACE_DARK,
        emissive: node.color,
        emissiveIntensity: 0.35,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true,
        opacity: 0.92,
      });
      const face = new THREE.Mesh(box, faceMaterial);

      const edgeMaterial = new THREE.LineBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.95,
      });
      const wireframe = new THREE.LineSegments(edges, edgeMaterial);

      const group = new THREE.Group();
      group.add(face);
      group.add(wireframe);
      group.scale.setScalar(node.radius);
      group.userData.nodeIndex = index;
      this.scene.add(group);

      return { group, faceMaterial, edgeMaterial };
    });

    const indexById = new Map(graph.nodes.map((n, i) => [n.id, i]));
    const positions = new Float32Array(graph.links.length * 6);
    const colors = new Float32Array(graph.links.length * 6);
    const color = new THREE.Color();
    graph.links.forEach((link, i) => {
      const s = indexById.get(link.source) ?? 0;
      const t = indexById.get(link.target) ?? 0;
      color.set(graph.nodes[s].color).toArray(colors, i * 6);
      color.set(graph.nodes[t].color).toArray(colors, i * 6 + 3);
    });
    this.edgeGeometry = new THREE.BufferGeometry();
    this.edgeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.edgeGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.edgeLines = new THREE.LineSegments(
      this.edgeGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: EDGE_OPACITY,
        depthWrite: false,
      }),
    );
    this.scene.add(this.edgeLines);
    this.applyNodeVisibility();
  }

  private clearGraphObjects(): void {
    for (const { group, faceMaterial, edgeMaterial } of this.nodeVisuals) {
      this.scene.remove(group);
      faceMaterial.dispose();
      edgeMaterial.dispose();
    }
    this.nodeVisuals = [];
    this.nodeBoxGeometry?.dispose();
    this.nodeEdgesGeometry?.dispose();
    this.nodeBoxGeometry = null;
    this.nodeEdgesGeometry = null;
    if (this.edgeLines) {
      this.scene.remove(this.edgeLines);
      (this.edgeLines.material as THREE.Material).dispose();
      this.edgeGeometry?.dispose();
      this.edgeLines = null;
      this.edgeGeometry = null;
    }
    this.hoveredIndex = null;
    this.draggedIndex = null;
    this.dragFollowers = [];
    this.activePointerId = null;
    this.dragMoved = false;
    this.dragHighlightIndices = [];
  }

  /** Faint particle field for depth perception while orbiting. */
  private addDust(): void {
    const positions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      const radius = 220 + Math.random() * 280;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x94a3b8,
        size: 1.1,
        transparent: true,
        opacity: 0.35,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
    this.scene.add(dust);
  }

  // ── Frame loop ────────────────────────────────────────────────────────────

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    this.tickDragMotion();
    const layoutMoved = this.layout.step();
    this.syncPositions();

    // Keep every cube in frame while the force layout is still settling (it
    // over-expands during warmup, then contracts). Auto-framing ends the first
    // time the graph comes to rest, so later drag reheats don't snap the view.
    if (this.autoFraming && !this.userAdjustedView && this.draggedIndex === null) {
      this.fitToOverview();
      if (!layoutMoved) this.autoFraming = false;
    }

    if (this.focusTarget) {
      this.controls.target.lerp(this.focusTarget, 0.08);
      if (this.controls.target.distanceTo(this.focusTarget) < 0.5) this.focusTarget = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private syncPositions(): void {
    const layoutNodes = this.layout.nodes;
    for (let i = 0; i < this.nodeVisuals.length; i++) {
      const p = layoutNodes[i];
      this.nodeVisuals[i].group.position.set(p.x, p.y, p.z);
    }
    if (this.edgeGeometry) {
      const attr = this.edgeGeometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attr.array as Float32Array;
      this.layout.links.forEach((link, i) => {
        const a = layoutNodes[link.sourceIndex];
        const b = layoutNodes[link.targetIndex];
        array[i * 6] = a.x;
        array[i * 6 + 1] = a.y;
        array[i * 6 + 2] = a.z;
        array[i * 6 + 3] = b.x;
        array[i * 6 + 4] = b.y;
        array[i * 6 + 5] = b.z;
      });
      attr.needsUpdate = true;
      this.edgeGeometry.computeBoundingSphere();
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private updateRayFromEvent(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pickNodeIndex(event: PointerEvent): number | null {
    this.updateRayFromEvent(event);
    const hit = this.raycaster.intersectObjects(
      this.nodeVisuals.map((v) => v.group),
      true,
    )[0];
    if (!hit) return null;
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj.userData.nodeIndex !== undefined) return obj.userData.nodeIndex as number;
      obj = obj.parent;
    }
    return null;
  }

  private setNodeScale(index: number, radius: number): void {
    this.nodeVisuals[index].group.scale.setScalar(radius);
  }

  private setNodeEmissive(index: number, intensity: number): void {
    this.nodeVisuals[index].faceMaterial.emissiveIntensity = intensity;
    this.nodeVisuals[index].edgeMaterial.opacity = intensity >= 1 ? 1 : 0.95;
  }

  private setHovered(index: number | null): void {
    if (this.hoveredIndex === index) return;
    if (this.hoveredIndex !== null) {
      const node = this.graphNodes[this.hoveredIndex];
      if (node) {
        this.setNodeScale(this.hoveredIndex, node.radius);
        this.setNodeEmissive(this.hoveredIndex, 0.35);
      }
    }
    this.hoveredIndex = index;
    if (index !== null) {
      const node = this.graphNodes[index];
      this.setNodeScale(index, node.radius * HOVER_SCALE);
      this.setNodeEmissive(index, 1.0);
    }
    const node = index !== null ? this.graphNodes[index] : null;
    this.renderer.domElement.style.cursor =
      index !== null && node && isLayoutAnchor(node) ? "grab" : index !== null ? "pointer" : "";
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const rect = this.container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (this.draggedIndex !== null) {
      this.updateRayFromEvent(event);
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
        this.dragTarget.copy(this.dragPoint);
        this.dragTargetActive = true;
        this.dragMoved = true;
        this.updateDragPlaneThroughAnchor(this.draggedIndex);
      }
      this.callbacks.onHover(this.graphNodes[this.draggedIndex], localX, localY);
      return;
    }

    const index = this.pickNodeIndex(event);
    this.setHovered(index);
    this.callbacks.onHover(index !== null ? this.graphNodes[index] : null, localX, localY);
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
    const index = this.pickNodeIndex(event);
    this.pointerDownIndex = index;
    if (index === null) return;

    const node = this.graphNodes[index];
    if (!isLayoutAnchor(node)) return;

    const p = this.layout.nodes[index];
    this.draggedIndex = index;
    this.dragFollowers = this.beginAnchorDrag(index);
    this.dragMoved = false;
    this.dragTargetActive = false;
    this.dragTarget.set(p.x, p.y, p.z);
    this.setDragHighlight([index, ...this.dragFollowers.map((f) => f.index)]);
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.renderer.domElement.style.cursor = "grabbing";
    this.updateDragPlaneThroughAnchor(index);
    this.activePointerId = event.pointerId;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const wasClick =
      this.pointerDownAt !== null &&
      Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y) <
        DRAG_CLICK_THRESHOLD_PX;
    const downIndex = this.pointerDownIndex;
    this.pointerDownAt = null;
    this.pointerDownIndex = null;

    if (this.draggedIndex !== null) {
      const index = this.draggedIndex;
      const moved = this.dragMoved;
      this.finishAnchorDrag(index, moved);
      if (!moved && wasClick) this.callbacks.onSelect(this.graphNodes[index]);
      return;
    }
    if (wasClick) {
      this.callbacks.onSelect(downIndex !== null ? this.graphNodes[downIndex] : null);
    }
  };

  private handlePointerCancel = (): void => {
    if (this.draggedIndex === null) return;
    this.finishAnchorDrag(this.draggedIndex, this.dragMoved);
  };

  private handleLostPointerCapture = (): void => {
    if (this.draggedIndex === null) return;
    this.finishAnchorDrag(this.draggedIndex, this.dragMoved);
  };

  private handlePointerLeave = (): void => {
    if (this.draggedIndex !== null) return;
    this.setHovered(null);
    this.callbacks.onHover(null, 0, 0);
  };

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (!this.userAdjustedView) this.fitToOverview();
  }
}
