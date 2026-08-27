import { useMemo, useState } from 'react';
import type { TocNode } from '../../types';

interface TreeNode extends TocNode {
  children: TreeNode[];
}

function buildTree(nodes: TocNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) byId.set(node.id, { ...node, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.pageIndex - b.pageIndex || a.order - b.order);
    for (const child of list) sort(child.children);
  };
  sort(roots);

  return roots;
}

export function TocDrawer({
  nodes,
  activeNodeId,
  onSelect,
  onClose,
}: {
  nodes: TocNode[];
  activeNodeId: string | null;
  onSelect: (node: TocNode) => void;
  onClose: () => void;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Open the branch containing the current position, nothing else.
    const open = new Set<string>();
    let cursor = nodes.find((node) => node.id === activeNodeId);
    while (cursor?.parentId) {
      open.add(cursor.parentId);
      cursor = nodes.find((node) => node.id === cursor!.parentId);
    }
    return open;
  });

  const toggle = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNodes = (list: TreeNode[], depth: number) =>
    list.map((node) => {
      const isOpen = expanded.has(node.id);
      const isActive = node.id === activeNodeId;

      return (
        <li key={node.id}>
          <div
            className={`flex items-start gap-1 rounded-md ${isActive ? 'bg-accent/10' : 'hover:bg-rule/40'}`}
            style={{ paddingInlineStart: depth * 12 }}
          >
            {node.children.length > 0 ? (
              <button
                onClick={() => toggle(node.id)}
                className="mt-1.5 h-5 w-5 shrink-0 rounded text-xs text-muted hover:bg-rule"
                aria-label={isOpen ? 'Collapse' : 'Expand'}
              >
                {isOpen ? '−' : '+'}
              </button>
            ) : (
              <span className="mt-1.5 h-5 w-5 shrink-0" />
            )}
            <button
              onClick={() => onSelect(node)}
              dir="rtl"
              className={`arabic flex-1 py-1.5 text-right text-[15px] leading-snug ${
                isActive ? 'font-semibold text-accent' : ''
              }`}
            >
              {node.title}
            </button>
          </div>
          {isOpen && node.children.length > 0 && (
            <ul>{renderNodes(node.children, depth + 1)}</ul>
          )}
        </li>
      );
    });

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-label="Table of contents">
      <button
        className="flex-1 bg-black/20"
        onClick={onClose}
        aria-label="Close table of contents"
      />
      <aside className="no-select flex h-full w-[min(26rem,85vw)] flex-col border-l border-rule bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-rule px-4 py-3">
          <h2 className="text-sm font-semibold">فهرس الموضوعات — Contents</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-muted hover:bg-rule">
            Close
          </button>
        </div>
        <nav className="flex-1 overflow-auto p-2">
          <ul>{renderNodes(tree, 0)}</ul>
        </nav>
      </aside>
    </div>
  );
}
