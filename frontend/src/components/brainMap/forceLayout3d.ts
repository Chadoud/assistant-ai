/**
 * Minimal 3D force-directed layout (springs + charge repulsion).
 *
 * The root node stays pinned at the origin so the graph cannot "retract" into
 * a collapsed ball — a common failure mode when centering forces fight springs.
 *
 * User-placed anchors (folders / category hubs) stay fixed after drag; their
 * direct children follow via stored offsets.
 */

import type { BrainGraph } from "./graphModel";
import { ROOT_NODE_ID } from "./graphModel";
import type { BrainMapLayoutStore } from "./brainMapLayoutStore";

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Pinned during drag, for root, or after the user places an anchor cluster. */
  fixed: boolean;
  mass: number;
  userPlaced: boolean;
  followAnchorIndex: number | null;
  offsetFromAnchor: { dx: number; dy: number; dz: number } | null;
}

interface LayoutLink {
  sourceIndex: number;
  targetIndex: number;
  restLength: number;
}

const REPULSION = 480;
const SPRING_STIFFNESS = 0.028;
const DAMPING = 0.9;
const MAX_VELOCITY = 3.8;
const SLEEP_ALPHA = 0.004;

/** Initial radius by node kind — spreads hubs on a shell before springs take over. */
function initialShellRadius(kind: string): number {
  switch (kind) {
    case "root":
      return 0;
    case "category":
      return 58;
    case "folder":
      return 68;
    case "conversation":
      return 88;
    case "file":
    case "memory":
    case "task":
      return 78;
    default:
      return 70;
  }
}

export class ForceLayout3D {
  nodes: LayoutNode[] = [];
  links: LayoutLink[] = [];
  private alpha = 1;
  private rootIndex = 0;
  private indexById = new Map<string, number>();

  constructor(graph: BrainGraph) {
    const n = graph.nodes.length;

    graph.nodes.forEach((node, i) => {
      this.indexById.set(node.id, i);
      const isRoot = node.id === ROOT_NODE_ID;
      if (isRoot) this.rootIndex = i;

      let x = 0;
      let y = 0;
      let z = 0;
      if (!isRoot) {
        const shell = initialShellRadius(node.kind);
        const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(n, 1));
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        x = shell * Math.sin(phi) * Math.cos(theta);
        y = shell * Math.sin(phi) * Math.sin(theta);
        z = shell * Math.cos(phi);
      }

      this.nodes.push({
        id: node.id,
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        fixed: isRoot,
        mass: isRoot ? 8 : node.kind === "category" || node.kind === "folder" ? 3 : 1,
        userPlaced: false,
        followAnchorIndex: null,
        offsetFromAnchor: null,
      });
    });

    for (const link of graph.links) {
      const sourceIndex = this.indexById.get(link.source);
      const targetIndex = this.indexById.get(link.target);
      if (sourceIndex !== undefined && targetIndex !== undefined) {
        this.links.push({ sourceIndex, targetIndex, restLength: link.restLength });
      }
    }
  }

  getNodeIndex(nodeId: string): number | undefined {
    return this.indexById.get(nodeId);
  }

  /** True when both nodes belong to the same user-placed cluster. */
  private isClusterPair(aIndex: number, bIndex: number): boolean {
    const a = this.nodes[aIndex];
    const b = this.nodes[bIndex];
    if (b.followAnchorIndex === aIndex || a.followAnchorIndex === bIndex) return true;
    const aAnchor = a.followAnchorIndex;
    const bAnchor = b.followAnchorIndex;
    return aAnchor !== null && aAnchor === bAnchor;
  }

  private applyFollowAnchors(): void {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node.followAnchorIndex === null || !node.offsetFromAnchor) continue;
      const anchor = this.nodes[node.followAnchorIndex];
      node.x = anchor.x + node.offsetFromAnchor.dx;
      node.y = anchor.y + node.offsetFromAnchor.dy;
      node.z = anchor.z + node.offsetFromAnchor.dz;
      node.vx = 0;
      node.vy = 0;
      node.vz = 0;
    }
  }

  /**
   * Pin an anchor cluster after the user drags it.
   * @param anchorIndex Layout index of the folder / category hub.
   * @param followers Direct children with offsets relative to the anchor.
   */
  commitUserPlacedCluster(
    anchorIndex: number,
    followers: { index: number; dx: number; dy: number; dz: number }[],
  ): void {
    const anchor = this.nodes[anchorIndex];
    anchor.userPlaced = true;
    anchor.fixed = true;
    anchor.followAnchorIndex = null;
    anchor.offsetFromAnchor = null;
    anchor.vx = anchor.vy = anchor.vz = 0;

    for (const follower of followers) {
      const child = this.nodes[follower.index];
      child.userPlaced = true;
      child.fixed = true;
      child.followAnchorIndex = anchorIndex;
      child.offsetFromAnchor = { dx: follower.dx, dy: follower.dy, dz: follower.dz };
      child.vx = child.vy = child.vz = 0;
    }
    this.applyFollowAnchors();
  }

  /** Restore user placements after warm-up (graph refresh / initial load). */
  applySavedPlacements(store: BrainMapLayoutStore): void {
    for (const [anchorId, placement] of Object.entries(store)) {
      const anchorIndex = this.indexById.get(anchorId);
      if (anchorIndex === undefined) continue;

      const anchor = this.nodes[anchorIndex];
      anchor.x = placement.x;
      anchor.y = placement.y;
      anchor.z = placement.z;

      const followers: { index: number; dx: number; dy: number; dz: number }[] = [];
      for (const [childId, offset] of Object.entries(placement.childOffsets)) {
        const childIndex = this.indexById.get(childId);
        if (childIndex === undefined) continue;
        followers.push({
          index: childIndex,
          dx: offset.dx,
          dy: offset.dy,
          dz: offset.dz,
        });
      }
      this.commitUserPlacedCluster(anchorIndex, followers);
    }
  }

  /**
   * Attach descendants that were added after the layout was saved (e.g. new sorted files).
   * Uses their post-warmup positions relative to the placed anchor.
   */
  attachUnsetDirectChildren(childrenById: Map<string, string[]>): void {
    for (let anchorIndex = 0; anchorIndex < this.nodes.length; anchorIndex++) {
      const anchor = this.nodes[anchorIndex];
      if (!anchor.userPlaced || anchor.followAnchorIndex !== null) continue;

      const descendantIds = this.collectDescendantIds(anchor.id, childrenById);
      descendantIds.delete(anchor.id);
      const newFollowers: { index: number; dx: number; dy: number; dz: number }[] = [];

      for (const childId of descendantIds) {
        const childIndex = this.indexById.get(childId);
        if (childIndex === undefined) continue;
        const child = this.nodes[childIndex];
        if (child.followAnchorIndex === anchorIndex) continue;
        newFollowers.push({
          index: childIndex,
          dx: child.x - anchor.x,
          dy: child.y - anchor.y,
          dz: child.z - anchor.z,
        });
      }

      if (newFollowers.length === 0) continue;

      const existingFollowers = this.nodes
        .map((node, index) => ({ node, index }))
        .filter(({ node }) => node.followAnchorIndex === anchorIndex)
        .map(({ node, index }) => ({
          index,
          dx: node.offsetFromAnchor!.dx,
          dy: node.offsetFromAnchor!.dy,
          dz: node.offsetFromAnchor!.dz,
        }));

      this.commitUserPlacedCluster(anchorIndex, [...existingFollowers, ...newFollowers]);
    }
  }

  private collectDescendantIds(rootId: string, childrenById: Map<string, string[]>): Set<string> {
    const out = new Set<string>([rootId]);
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const child of childrenById.get(id) ?? []) {
        if (!out.has(child)) {
          out.add(child);
          stack.push(child);
        }
      }
    }
    return out;
  }

  reheat(amount = 0.55): void {
    this.alpha = Math.max(this.alpha, amount);
  }

  /** Run layout ticks synchronously — used before framing the overview camera. */
  warmUp(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }

  get isSettled(): boolean {
    return this.alpha < SLEEP_ALPHA;
  }

  step(): boolean {
    if (this.isSettled) {
      this.applyFollowAnchors();
      return false;
    }
    const n = this.nodes.length;

    for (let i = 0; i < n; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.nodes[j];
        if (this.isClusterPair(i, j)) continue;

        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 1) {
          dx = ((i % 5) - 2) * 0.31;
          dy = ((j % 5) - 2) * 0.27;
          dz = 0.23;
          distSq = dx * dx + dy * dy + dz * dz;
        }
        const dist = Math.sqrt(distSq);
        const force = (REPULSION * this.alpha) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        if (!a.fixed) {
          a.vx += fx / a.mass;
          a.vy += fy / a.mass;
          a.vz += fz / a.mass;
        }
        if (!b.fixed) {
          b.vx -= fx / b.mass;
          b.vy -= fy / b.mass;
          b.vz -= fz / b.mass;
        }
      }
    }

    for (const link of this.links) {
      if (this.isClusterPair(link.sourceIndex, link.targetIndex)) continue;

      const a = this.nodes[link.sourceIndex];
      const b = this.nodes[link.targetIndex];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const stretch = (dist - link.restLength) * SPRING_STIFFNESS * this.alpha * 2;
      const fx = (dx / dist) * stretch;
      const fy = (dy / dist) * stretch;
      const fz = (dz / dist) * stretch;
      if (!a.fixed) {
        a.vx += fx / a.mass;
        a.vy += fy / a.mass;
        a.vz += fz / a.mass;
      }
      if (!b.fixed) {
        b.vx -= fx / b.mass;
        b.vy -= fy / b.mass;
        b.vz -= fz / b.mass;
      }
    }

    for (const node of this.nodes) {
      if (node.fixed) {
        node.vx = node.vy = node.vz = 0;
        continue;
      }
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.vz *= DAMPING;
      const speed = Math.sqrt(node.vx ** 2 + node.vy ** 2 + node.vz ** 2);
      if (speed > MAX_VELOCITY) {
        const scale = MAX_VELOCITY / speed;
        node.vx *= scale;
        node.vy *= scale;
        node.vz *= scale;
      }
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    }

    this.applyFollowAnchors();

    const root = this.nodes[this.rootIndex];
    root.x = root.y = root.z = 0;
    root.vx = root.vy = root.vz = 0;

    this.alpha *= 0.987;
    return true;
  }
}
