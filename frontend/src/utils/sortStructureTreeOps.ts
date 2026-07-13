import type { SortStructureModule } from "../types/sortStructure";

/** Depth-first chain from root module to deepest leaf (one branch per root). */
export function moduleToChain(mod: SortStructureModule): SortStructureModule[] {
  const chain: SortStructureModule[] = [mod];
  let current = mod;
  while (current.children.length > 0) {
    current = current.children[0];
    chain.push(current);
  }
  return chain;
}

export function updateModuleById(
  modules: SortStructureModule[],
  id: string,
  next: SortStructureModule
): SortStructureModule[] {
  return modules.map((mod) => {
    if (mod.id === id) return next;
    if (mod.children.some((c) => c.id === id) || mod.children.length) {
      return { ...mod, children: updateModuleById(mod.children, id, next) };
    }
    return mod;
  });
}

export function removeModuleById(modules: SortStructureModule[], id: string): SortStructureModule[] {
  return modules
    .filter((m) => m.id !== id)
    .map((mod) => ({ ...mod, children: removeModuleById(mod.children, id) }));
}

/** Append a child to the module with `parentId` (root uses parentId in modules list). */
export function appendChildToModule(
  modules: SortStructureModule[],
  parentId: string,
  child: SortStructureModule
): SortStructureModule[] {
  return modules.map((mod) => {
    if (mod.id === parentId) {
      return { ...mod, children: [...mod.children, child] };
    }
    return { ...mod, children: appendChildToModule(mod.children, parentId, child) };
  });
}
