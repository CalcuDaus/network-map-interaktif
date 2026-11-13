/**
 * NetMap — Cytoscape Layout & Styling Configuration
 * Dark technical aesthetic matching NetMap dashboard
 */

export const TOPOLOGY_STYLESHEET = [
  // Regular Nodes
  {
    selector: 'node[!isGroup]',
    style: {
      'shape': 'round-rectangle',
      'width': 130,
      'height': 60,
      'background-color': '#18350d',
      'border-width': 2,
      'border-color': 'data(catColor)',
      'label': 'data(label)',
      'color': '#fff8cf',
      'font-size': 11,
      'font-family': "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': 120,
      'text-margin-y': 0,
      'shadow-blur': 10,
      'shadow-color': 'rgba(0, 0, 0, 0.3)',
      'shadow-opacity': 0.8
    }
  },

  // Compound / Group Nodes (VLAN Containers)
  {
    selector: 'node[isGroup]',
    style: {
      'shape': 'round-rectangle',
      'background-color': 'rgba(118, 196, 87, 0.15)',
      'border-width': 1.5,
      'border-color': '#76c457',
      'border-style': 'dashed',
      'label': 'data(label)',
      'color': '#2a7c13',
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
      'border-color': '#76c457',
      'border-width': 3,
      'shadow-color': '#76c457',
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
      'color': '#678458',
      'font-size': 9,
      'font-family': 'ui-monospace, monospace',
      'text-background-color': '#18350d',
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
      'line-color': '#76c457',
      'target-arrow-color': '#76c457',
      'color': '#fff8cf'
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

