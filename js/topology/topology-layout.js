/**
 * NetMap — Cytoscape Layout & Styling Configuration
 * Dark technical aesthetic matching NetMap dashboard
 */

export const TOPOLOGY_STYLESHEET = [
  // Regular Nodes with isometric hardware icon
  {
    selector: 'node[!isGroup]',
    style: {
      'shape': 'round-rectangle',
      'width': 136,
      'height': 74,
      'background-color': '#f4f7f0',
      'border-width': 2.2,
      'border-color': 'data(catColor)',
      'background-image': 'data(iconUrl)',
      'background-fit': 'contain',
      'background-width': '34px',
      'background-height': '34px',
      'background-position-x': '50%',
      'background-position-y': '6px',
      'label': 'data(label)',
      'color': '#1f2937',
      'font-size': 10,
      'font-weight': '600',
      'font-family': "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': 126,
      'text-margin-y': -6,
      'shadow-blur': 10,
      'shadow-color': 'rgba(0, 0, 0, 0.25)',
      'shadow-opacity': 0.8
    }
  },

  // Compound / Group Nodes (VLAN Containers)
  {
    selector: 'node[isGroup]',
    style: {
      'shape': 'round-rectangle',
      'background-color': 'rgba(83, 123, 142, 0.15)',
      'border-width': 1.5,
      'border-color': '#537b8e',
      'border-style': 'dashed',
      'label': 'data(label)',
      'color': '#2a5367',
      'font-size': 12,
      'font-weight': 'bold',
      'font-family': "'Poppins', -apple-system, sans-serif",
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': -8,
      'padding': 20
    }
  },

  // Selected Node
  {
    selector: 'node:selected',
    style: {
      'border-color': '#537b8e',
      'border-width': 3,
      'shadow-color': '#537b8e',
      'shadow-blur': 15,
      'shadow-opacity': 1
    }
  },

  // Edges
  {
    selector: 'edge',
    style: {
      'width': 3,
      'line-color': 'data(lineColor)',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'data(lineColor)',
      'arrow-scale': 1.2,
      'label': 'data(label)',
      'color': '#537b8e',
      'font-size': 9,
      'font-family': 'ui-monospace, monospace',
      'text-background-color': '#0b1620',
      'text-background-opacity': 0.85,
      'text-background-padding': 3,
      'text-background-shape': 'roundrectangle'
    }
  },

  // Selected Edge
  {
    selector: 'edge:selected',
    style: {
      'width': 5,
      'line-color': '#537b8e',
      'target-arrow-color': '#537b8e',
      'color': '#e3edf0'
    }
  }
];

export function getDagreLayoutOptions(rankDir = 'TB') {
  return {
    name: window.cytoscape && window.cytoscape('dagre') ? 'dagre' : 'cose',
    rankDir: rankDir, // 'TB' = Top to Bottom, 'LR' = Left to Right
    nodeSep: 60,
    rankSep: 90,
    animate: true,
    animationDuration: 400,
    padding: 40
  };
}

