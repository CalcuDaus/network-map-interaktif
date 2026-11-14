/**
 * NetMap — Main Application Entry Point
 * Bootstraps Konva Map Engine, Devices, Cables, Drawing Tool, Topology Visualizer, Search & Storage
 */

import { stateManager } from './core/state-manager.js';
import { eventBus } from './core/event-bus.js';
import { coordinateSystem } from './map/coordinate-system.js';
import { MapEngine } from './map/map-engine.js';
import { Toolbar } from './ui/toolbar.js';
import { StatusBar } from './ui/status-bar.js';
import { DeviceManager } from './devices/device-manager.js';
import { DevicePalette } from './ui/device-palette.js';
import { PropertiesPanel } from './ui/properties-panel.js';
import { DeviceLayersPanel } from './ui/device-layers-panel.js';
import { CableManager } from './connections/cable-manager.js';
import { CableDrawingTool } from './connections/cable-drawing-tool.js';
import { ConnectionPanel } from './ui/connection-panel.js';
import { ViewportNavigator } from './ui/viewport-navigator.js';
import { SearchEngine } from './search/search-engine.js';
import { SearchUI } from './search/search-ui.js';
import { TopologyModal } from './topology/topology-modal.js';
import { IpVlanModal } from './ui/ip-vlan-modal.js';
import { LayerControls } from './ui/layer-controls.js';
import { ProjectStorage } from './storage/project-storage.js';
import { ExportModal } from './ui/export-modal.js';
import { ProjectModal } from './ui/project-modal.js';
import { HistoryManager } from './core/history-manager.js';
import { ContextMenu } from './ui/context-menu.js';
import { CustomDeviceModal } from './ui/custom-device-modal.js';
import { MikrotikQuickInsertModal } from './ui/mikrotik-quick-insert-modal.js';
import { MapScaleModal } from './ui/map-scale-modal.js';
import { Map3DEngine } from './map/map-3d-engine.js';
import { Room3DModal } from './ui/room-3d-modal.js';
import { Object3DModal } from './ui/object-3d-modal.js';
import { Device3DModelModal } from './ui/device-3d-modal.js';
import { PortPickerModal } from './ui/port-picker-modal.js';

class NetMapApp {
  constructor() {
    this.mapEngine = null;
    this.toolbar = null;
    this.statusBar = null;
    this.deviceManager = null;
    this.cableManager = null;
    this.cableDrawingTool = null;
    this.devicePalette = null;
    this.propertiesPanel = null;
    this.connectionPanel = null;
    this.viewportNavigator = null;
    this.searchEngine = null;
    this.searchUI = null;
    this.topologyModal = null;
    this.ipVlanModal = null;
    this.layerControls = null;
    this.contextMenu = null;
    this.customDeviceModal = null;
    this.mikrotikQuickInsertModal = null;
    this.mapScaleModal = null;
    this.map3DEngine = null;
    this.room3DModal = null;
    this.object3DModal = null;
    this.device3DModelModal = null;
    this.projectStorage = null;
    this.exportModal = null;
    this.projectModal = null;
    this.historyManager = null;
  }

  async init() {
    console.info('[NetMap] Initializing Application (Phase 5 — Storage & Export Engine)...');

    // 1. Render initial Lucide Icons
    this.renderIcons();

    // 2. Initialize Status Bar
    this.statusBar = new StatusBar();

    // 3. Initialize Map Engine & Konva Stage
    try {
      this.mapEngine = new MapEngine('konva-stage-container');
      await this.mapEngine.init();
      console.info('[NetMap] Map Engine initialized successfully.');
    } catch (err) {
      console.error('[NetMap] Failed to initialize Map Engine:', err);
      return;
    }

    // 4. Initialize Toolbar & HUD bindings
    this.toolbar = new Toolbar(this.mapEngine);

    // 5. Initialize Viewport Navigator (Smooth Camera)
    this.viewportNavigator = new ViewportNavigator(
      this.mapEngine.stage,
      this.mapEngine.mapDimensions
    );

    // 6. Initialize Device Manager
    this.deviceManager = new DeviceManager({
      deviceLayer: this.mapEngine.layers.deviceLayer,
      naturalWidth: this.mapEngine.mapDimensions.width,
      naturalHeight: this.mapEngine.mapDimensions.height
    });

    // 7. Initialize Cable Manager
    this.cableManager = new CableManager({
      deviceManager: this.deviceManager,
      connectionLayer: this.mapEngine.layers.connectionLayer,
      interactionLayer: this.mapEngine.layers.interactionLayer,
      naturalWidth: this.mapEngine.mapDimensions.width,
      naturalHeight: this.mapEngine.mapDimensions.height
    });

    // 8. Initialize Project Storage (IndexedDB & Auto-Save)
    this.projectStorage = new ProjectStorage({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager
    });

    // 9. Initialize Cable Drawing Tool
    this.cableDrawingTool = new CableDrawingTool({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      stage: this.mapEngine.stage,
      interactionLayer: this.mapEngine.layers.interactionLayer,
      naturalWidth: this.mapEngine.mapDimensions.width,
      naturalHeight: this.mapEngine.mapDimensions.height
    });

    // 10. Initialize UI Panels (Left Palette & Right Properties)
    const paletteContainer = document.getElementById('device-palette-container');
    if (paletteContainer) {
      this.devicePalette = new DevicePalette(paletteContainer);
    }

    const propertiesContainer = document.getElementById('properties-panel-container');
    if (propertiesContainer) {
      this.propertiesPanel = new PropertiesPanel(propertiesContainer, this.deviceManager);
      this.connectionPanel = new ConnectionPanel(propertiesContainer, this.cableManager, this.deviceManager);
    }

    const layersPanelContainer = document.getElementById('device-layers-panel-container');
    if (layersPanelContainer) {
      this.deviceLayersPanel = new DeviceLayersPanel({
        container: layersPanelContainer,
        deviceManager: this.deviceManager,
        viewportNavigator: this.viewportNavigator,
        getMap3DEngine: () => this.map3DEngine
      });
    }

    // 11. Initialize Search Engine & Search UI
    this.searchEngine = new SearchEngine(this.deviceManager, this.cableManager);
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
      this.searchUI = new SearchUI({
        inputElement: searchInput,
        searchEngine: this.searchEngine,
        viewportNavigator: this.viewportNavigator
      });
    }

    // 12. Initialize Modals (Topology, IP/VLAN, Export, Project)
    this.topologyModal = new TopologyModal({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      viewportNavigator: this.viewportNavigator
    });

    this.ipVlanModal = new IpVlanModal({
      deviceManager: this.deviceManager,
      viewportNavigator: this.viewportNavigator
    });

    this.exportModal = new ExportModal({
      projectStorage: this.projectStorage,
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      stage: this.mapEngine.stage,
      interactionLayer: this.mapEngine.layers.interactionLayer
    });

    this.projectModal = new ProjectModal({
      projectStorage: this.projectStorage,
      deviceManager: this.deviceManager,
      cableManager: this.cableManager
    });

    // 13. Initialize Layer Controls & Sub-Filters
    this.layerControls = new LayerControls({
      mapLayers: this.mapEngine.layers,
      mapEngine: this.mapEngine,
      deviceManager: this.deviceManager,
      cableManager: this.cableManager
    });

    // 13b. Setup Selection Focus Mode (Dim map background on object click)
    this.mapEngine.setupSelectionFocusListeners(this.deviceManager, this.cableManager);

    // 14. Initialize History Manager (Undo / Redo with Ctrl+Z / Ctrl+Y)
    this.historyManager = new HistoryManager({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager
    });

    // 14b. Initialize Floating Context Menu (Right-Click Shortcuts & Direct Deletion)
    this.contextMenu = new ContextMenu({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      viewportNavigator: this.viewportNavigator,
      mapEngine: this.mapEngine,
      stage: this.mapEngine.stage
    });

    // 14c. Initialize Custom Device Modal
    this.customDeviceModal = new CustomDeviceModal({
      deviceManager: this.deviceManager,
      devicePalette: this.devicePalette,
      mapEngine: this.mapEngine
    });

    // 14c-2. Initialize MikroTik Quick & Batch Insert Modal
    this.mikrotikQuickInsertModal = new MikrotikQuickInsertModal({
      deviceManager: this.deviceManager,
      mapEngine: this.mapEngine
    });

    // 14d. Initialize Map Scale Calibration Modal
    this.mapScaleModal = new MapScaleModal({
      cableManager: this.cableManager,
      naturalWidth: this.mapEngine.naturalWidth,
      naturalHeight: this.mapEngine.naturalHeight
    });

    // 14e. Initialize 3D Map Engine (Three.js, lazy WebGL on first 3D switch) & 3D Room Modal
    const map3dContainer = document.getElementById('map-3d-container');
    this.map3DEngine = new Map3DEngine({
      container: map3dContainer,
      mapEngine: this.mapEngine,
      deviceManager: this.deviceManager,
      cableManager: this.cableManager
    });
    this.room3DModal = new Room3DModal({
      deviceManager: this.deviceManager,
      map3DEngine: this.map3DEngine
    });
    this.object3DModal = new Object3DModal({
      deviceManager: this.deviceManager,
      map3DEngine: this.map3DEngine
    });
    this.device3DModelModal = new Device3DModelModal({
      deviceManager: this.deviceManager,
      map3DEngine: this.map3DEngine
    });
    this.portPickerModal = new PortPickerModal({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager
    });
    this.setup3DControls();

    // Global reference for modal coordination
    window.__netmapApp = this;

    // 15. Bind Modal & Action Trigger Buttons
    document.getElementById('btn-open-topology')?.addEventListener('click', () => {
      this.topologyModal.show();
    });

    document.getElementById('btn-open-ip-vlan')?.addEventListener('click', () => {
      this.ipVlanModal.show();
    });

    document.getElementById('btn-open-export')?.addEventListener('click', () => {
      this.exportModal.show();
    });

    document.getElementById('btn-open-project')?.addEventListener('click', () => {
      this.projectModal.show();
    });

    document.getElementById('btn-undo')?.addEventListener('click', () => {
      this.historyManager.undo();
    });

    document.getElementById('btn-redo')?.addEventListener('click', () => {
      this.historyManager.redo();
    });

    // 16. Setup Canvas Drag & Drop and Placement Handlers
    this.setupCanvasPlacementHandlers();

    // 17. Setup Device & Cable Counters
    this.setupDataCounters();

    // 18. Setup Keyboard Shortcuts
    this.setupKeyboardShortcuts();

    // 19. Restore from IndexedDB or seed initial campus data
    await this.loadOrSeedProject();

    // 20. Final icon rendering
    this.renderIcons();

    console.info('[NetMap] Phase 5 Application ready. Complete NetMap MVP operational.');
  }

  renderIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /**
   * Check IndexedDB for existing project data; if none exists, seed default campus data
   */
  async loadOrSeedProject() {
    try {
      const loaded = await this.projectStorage.loadProject('proj-default');
      if (loaded) {
        console.info('[NetMap] Project successfully restored from IndexedDB.');
      } else {
        console.info('[NetMap] No saved project in IndexedDB. Seeding initial campus topology...');
        this.seedSampleTopology();
        await this.projectStorage.saveCurrentProject();
      }
    } catch (err) {
      console.warn('[NetMap] Error reading IndexedDB, using fallback seed:', err);
      this.seedSampleTopology();
    }

    // Initialize baseline snapshot for undo / redo history stack
    this.historyManager?.initBaseline();
  }

  /**
   * Setup HTML5 Drag-and-Drop and Click-to-Place on Canvas Viewport
   */
  setupCanvasPlacementHandlers() {
    const viewport = document.getElementById('map-viewport');
    if (!viewport) return;

    // Handle HTML5 Drag Over
    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    // Handle HTML5 Drop
    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!rawData) return;

      try {
        const itemData = JSON.parse(rawData);
        const rect = viewport.getBoundingClientRect();
        const screenPointer = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };

        const stage = this.mapEngine.stage;
        const norm = coordinateSystem.screenToNormalized(screenPointer, stage, true);

        // Strip template internal IDs so it generates a fresh device instance ID
        const deviceData = { ...itemData, position: { x: norm.x, y: norm.y } };
        delete deviceData.templateId;
        delete deviceData.isCustom;
        delete deviceData.id;

        const newDevice = this.deviceManager.addDevice(deviceData);

        // Automatically select the placed device
        this.deviceManager.selectDevice(newDevice.id);
      } catch (err) {
        console.error('[NetMap] Failed to handle drop on canvas:', err);
      }
    });

    // Handle Click-to-Place in Add Device mode
    eventBus.on('canvas:place-device', ({ normalizedX, normalizedY, customDeviceData }) => {
      const currentMode = stateManager.getMode();
      if (currentMode === 'add-device') {
        const customTmpl = customDeviceData || this.devicePalette?.activeCustomTemplateToPlace;
        let deviceData;

        if (customTmpl) {
          deviceData = {
            ...customTmpl,
            position: { x: normalizedX, y: normalizedY }
          };
          delete deviceData.templateId;
          delete deviceData.isCustom;
          delete deviceData.id;
        } else {
          const typeToPlace = this.devicePalette?.activeTypeToPlace || 'router';
          deviceData = {
            type: typeToPlace,
            position: { x: normalizedX, y: normalizedY }
          };
        }

        const newDevice = this.deviceManager.addDevice(deviceData);
        this.deviceManager.selectDevice(newDevice.id);
        if (!this.devicePalette?.multiPlaceMode) {
          stateManager.setMode('select');
        }
      }
    });

    // Handle Deselect on Empty Canvas Click
    eventBus.on('canvas:clicked-empty', () => {
      this.deviceManager.deselectDevice();
      this.cableManager.deselectConnection();
    });

    // Handle 2D Box/Marquee Selection
    eventBus.on('canvas:marquee-select', ({ minNormX, maxNormX, minNormY, maxNormY, additive }) => {
      const matchedIds = [];
      this.deviceManager.getAllDevices().forEach((dev) => {
        if (dev.layerVisible === false) return;
        const px = dev.position?.x ?? 0;
        const py = dev.position?.y ?? 0;
        if (px >= minNormX && px <= maxNormX && py >= minNormY && py <= maxNormY) {
          matchedIds.push(dev.id);
        }
      });

      if (matchedIds.length > 0) {
        this.cableManager.deselectConnection();
        this.deviceManager.selectMultipleDevices(matchedIds, { additive });
      } else if (!additive) {
        this.deviceManager.deselectDevice();
        this.cableManager.deselectConnection();
      }
    });
  }

  setup3DControls() {
    const btn2d = document.getElementById('btn-view-2d');
    const btn3d = document.getElementById('btn-view-3d');
    const konvaContainer = document.getElementById('konva-stage-container');
    const map3dContainer = document.getElementById('map-3d-container');
    const hud3d = document.getElementById('hud-3d-controls');
    const hud3dHints = document.getElementById('hud-3d-hints');
    const hud2dZoom = document.querySelector('.map-hud-controls');
    const hudCompass = document.getElementById('hud-compass');

    const applyViewMode = (mode) => {
      const is3d = mode === '3d';
      btn2d?.classList.toggle('active', !is3d);
      btn3d?.classList.toggle('active', is3d);
      konvaContainer?.classList.toggle('hidden', is3d);
      if (konvaContainer) konvaContainer.style.display = is3d ? 'none' : '';
      hud2dZoom?.classList.toggle('hidden', is3d);
      if (hud2dZoom) hud2dZoom.style.display = is3d ? 'none' : '';
      hudCompass?.classList.toggle('hidden', is3d);
      if (hudCompass) hudCompass.style.display = is3d ? 'none' : '';

      map3dContainer?.classList.toggle('hidden', !is3d);
      if (map3dContainer) map3dContainer.style.display = is3d ? 'block' : 'none';
      hud3d?.classList.toggle('hidden', !is3d);
      if (hud3d) hud3d.style.display = is3d ? 'flex' : 'none';
      hud3dHints?.classList.toggle('hidden', !is3d);
      if (hud3dHints) hud3dHints.style.display = is3d ? 'flex' : 'none';

      if (is3d) {
        this.map3DEngine?.activate();
        const coverageToggle = document.getElementById('filter-toggle-coverage');
        if (coverageToggle) {
          this.map3DEngine?.setShowCoverage(Boolean(coverageToggle.checked));
        }
      } else {
        this.map3DEngine?.deactivate();
      }
    };

    // Enforce initial view state immediately on boot
    applyViewMode(stateManager.getViewMode());

    btn2d?.addEventListener('click', () => stateManager.setViewMode('2d'));
    btn3d?.addEventListener('click', () => stateManager.setViewMode('3d'));

    eventBus.on('viewmode:changed', ({ viewMode }) => {
      applyViewMode(viewMode);
    });

    // Coverage filter sync for 3D scene
    document.getElementById('filter-toggle-coverage')?.addEventListener('change', (e) => {
      this.map3DEngine?.setShowCoverage(Boolean(e.target.checked));
    });

    // SketchUp Navigation Tool Buttons (Orbit, Pan, Zoom, Look, Move, Box Select, Draw 3D)
    const navToolButtons = [
      { id: 'btn-3d-tool-orbit', tool: 'orbit' },
      { id: 'btn-3d-tool-pan', tool: 'pan' },
      { id: 'btn-3d-tool-zoom', tool: 'zoom' },
      { id: 'btn-3d-tool-look', tool: 'look' },
      { id: 'btn-3d-tool-move', tool: 'move' },
      { id: 'btn-3d-tool-box', tool: 'box' },
      { id: 'btn-3d-tool-draw3d', tool: 'draw3d' }
    ];
    navToolButtons.forEach(({ id, tool }) => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.map3DEngine?.setNavTool(tool);
        if (tool === 'draw3d') {
          this.object3DModal?.show();
        }
      });
    });
    eventBus.on('map3d:navtool-changed', ({ tool }) => {
      navToolButtons.forEach((b) => {
        document.getElementById(b.id)?.classList.toggle('active', b.tool === tool);
      });
    });

    // Camera preset buttons & SketchUp Zoom Extents
    document.getElementById('btn-3d-extents')?.addEventListener('click', () => {
      this.map3DEngine?.zoomExtents();
    });

    const presetButtons = [
      { id: 'btn-3d-iso', preset: 'iso' },
      { id: 'btn-3d-top', preset: 'top' },
      { id: 'btn-3d-front', preset: 'front' },
      { id: 'btn-3d-side', preset: 'side' },
      { id: 'btn-3d-focus', preset: 'focus' }
    ];
    presetButtons.forEach(({ id, preset }) => {
      document.getElementById(id)?.addEventListener('click', () => {
        presetButtons.forEach((b) => document.getElementById(b.id)?.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
        this.map3DEngine?.setCameraPreset(preset);
      });
    });

    // Object scale multiplier
    document.getElementById('select-3d-scale')?.addEventListener('change', (e) => {
      const val = Number(e.target.value) || 1;
      this.map3DEngine?.setDeviceScaleMultiplier(val);
    });

    // 3D Cable diameter multiplier (1.0 = matched to port socket size)
    document.getElementById('select-3d-cable-size')?.addEventListener('change', (e) => {
      const val = Number(e.target.value) || 1;
      this.map3DEngine?.setCableDiameterMultiplier(val);
    });

    // Explode overlapping devices toggle
    let exploded = false;
    const btnExplode = document.getElementById('btn-3d-explode');
    btnExplode?.addEventListener('click', () => {
      exploded = !exploded;
      btnExplode.classList.toggle('active', exploded);
      this.map3DEngine?.setExplodeStacks(exploded);
    });

    // Labels toggle
    let showLabels = true;
    const btnLabels = document.getElementById('btn-3d-labels');
    btnLabels?.addEventListener('click', () => {
      showLabels = !showLabels;
      btnLabels.classList.toggle('active', showLabels);
      this.map3DEngine?.setShowLabels(showLabels);
    });

    // Rooms, 3D Object Studio & Device 3D Model Modals
    document.getElementById('btn-3d-rooms')?.addEventListener('click', () => {
      this.room3DModal?.show();
    });
    document.getElementById('btn-3d-objects')?.addEventListener('click', () => {
      this.object3DModal?.toggle();
    });
    document.getElementById('btn-3d-device-models')?.addEventListener('click', () => {
      this.device3DModelModal?.show();
    });

    // Focus single device in 3D from PropertiesPanel
    eventBus.on('map3d:focus-device', ({ deviceId }) => {
      if (stateManager.getViewMode() !== '3d') {
        stateManager.setViewMode('3d');
      }
      setTimeout(() => {
        this.map3DEngine?.focusOnDevice(deviceId);
      }, 60);
    });
  }

  setupDataCounters() {
    const updateCounters = () => {
      const devCount = this.deviceManager.getAllDevices().length;
      const cabCount = this.cableManager.getAllConnections().length;

      const countBadge = document.getElementById('hud-device-count-badge');
      const countStatus = document.getElementById('status-device-count');

      if (countBadge) countBadge.textContent = `${devCount} Perangkat • ${cabCount} Link Kabel`;
      if (countStatus) countStatus.textContent = `${devCount} dev / ${cabCount} links`;
    };

    eventBus.on('device:added', updateCounters);
    eventBus.on('device:deleted', updateCounters);
    eventBus.on('connection:added', updateCounters);
    eventBus.on('connection:deleted', updateCounters);
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if focus is inside an input, textarea, or select
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      // Undo / Redo & Select-All Shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Ctrl+A)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          this.cableManager?.deselectConnection();
          this.deviceManager?.selectAllDevices({ onlyVisible: true });
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            this.historyManager?.redo();
          } else {
            this.historyManager?.undo();
          }
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          this.historyManager?.redo();
          return;
        }
      }

      // SketchUp-style 3D Navigation Shortcuts when 3D Map is active
      if (stateManager.getViewMode() === '3d') {
        const lower = e.key.toLowerCase();
        if (lower === 'o') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('orbit');
          return;
        }
        if (lower === 'h') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('pan');
          return;
        }
        if (lower === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            this.map3DEngine?.zoomExtents();
          } else {
            this.map3DEngine?.setNavTool('zoom');
          }
          return;
        }
        if (lower === 'l') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('look');
          return;
        }
        if (lower === 'm') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('move');
          return;
        }
        if (lower === 'b') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('box');
          return;
        }
        if (lower === 'p') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('draw3d');
          this.object3DModal?.show();
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          this.map3DEngine?.zoomExtents();
          return;
        }
        if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(lower)) {
          return; // Handled smoothly by Map3DEngine walk loop
        }
        if (e.key === 'Escape') {
          this.deviceManager.deselectDevice();
          this.cableManager.deselectConnection();
          stateManager.deselectObject3d?.();
          this.map3DEngine?.setNavTool('orbit');
          return;
        }
      }

      const interactions = this.mapEngine?.interactions;
      if (!interactions) return;

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          interactions.zoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          interactions.zoomOut();
          break;
        case '0':
          e.preventDefault();
          interactions.fitToScreen(30);
          break;
        case '1':
          e.preventDefault();
          interactions.resetView();
          break;
        case 'v':
        case 'V':
          stateManager.setMode('navigate');
          break;
        case 's':
        case 'S':
          stateManager.setMode('select');
          break;
        case 'a':
        case 'A':
          stateManager.setMode('add-device');
          break;
        case 'c':
        case 'C':
          stateManager.setMode('draw-cable');
          break;
        case 't':
        case 'T':
          e.preventDefault();
          this.topologyModal.show();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          this.ipVlanModal.show();
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          this.exportModal.show();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          this.projectModal.show();
          break;
        case 'k':
        case 'K':
          e.preventDefault();
          this.mapScaleModal.show();
          break;
        case 'Delete':
        case 'Backspace': {
          const selectedIds = this.deviceManager?.getSelectedDeviceIds?.() || [];
          if (selectedIds.length > 1) {
            e.preventDefault();
            if (confirm(`Hapus ${selectedIds.length} perangkat terpilih beserta seluruh kabelnya?`)) {
              this.deviceManager.deleteSelectedDevices();
            }
          } else if (this.deviceManager?.selectedDeviceId) {
            e.preventDefault();
            const curDev = this.deviceManager.getDeviceById(this.deviceManager.selectedDeviceId);
            if (curDev && confirm(`Hapus perangkat "${curDev.name}" beserta seluruh kabelnya?`)) {
              this.deviceManager.deleteDevice(curDev.id);
            }
          } else if (this.cableManager?.selectedCableId) {
            e.preventDefault();
            const curCab = this.cableManager.getConnectionById(this.cableManager.selectedCableId);
            if (curCab && confirm(`Hapus jalur kabel "${curCab.name}"?`)) {
              this.cableManager.deleteConnection(curCab.id);
            }
          } else {
            const selObj3dId = stateManager.getSelectedObject3dId?.();
            if (selObj3dId) {
              e.preventDefault();
              const curObj3d = stateManager.getObject3dById?.(selObj3dId);
              if (curObj3d && confirm(`Hapus objek 3D "${curObj3d.name || selObj3dId}"?`)) {
                stateManager.deleteObject3d(selObj3dId);
              }
            }
          }
          break;
        }
        case 'Escape':
          this.deviceManager.deselectDevice();
          this.cableManager.deselectConnection();
          stateManager.setMode('navigate');
          break;
      }
    });
  }

  /**
   * Pre-populate realistic sample network topology with devices & cable routes
   */
  seedSampleTopology() {
    // 1. Devices
    const sampleDevices = [
      {
        id: 'dev-core-router',
        name: 'Main Core Router',
        type: 'main-router',
        category: 'core',
        brand: 'MikroTik',
        model: 'CCR2004-16G-2S+',
        position: { x: 0.580, y: 0.185 },
        network: { ip: '192.168.1.1', mac: '48:8F:5A:11:22:33', subnet: '255.255.255.0', vlan: 1, hostname: 'rtr-core.campus.net' },
        status: 'online',
        location: 'Gedung Rektorat (NOC) Lt. 1',
        firmware: 'RouterOS v7.14',
        installedAt: '2026-01-15',
        notes: 'Main BGP & OSPF gateway kampus'
      },
      {
        id: 'dev-core-switch',
        name: 'Core Switch Backbone',
        type: 'core-switch',
        category: 'core',
        brand: 'Cisco',
        model: 'Catalyst 3850 48P',
        position: { x: 0.640, y: 0.225 },
        network: { ip: '192.168.1.2', mac: '00:26:0B:44:55:66', subnet: '255.255.255.0', vlan: 1, hostname: 'csw-noc-01' },
        status: 'online',
        location: 'Ruang Server NOC Rack 01',
        firmware: 'IOS-XE 16.12',
        installedAt: '2026-01-16',
        notes: 'Aggregation fiber link antar gedung'
      },
      {
        id: 'dev-server-db',
        name: 'Main Database Server',
        type: 'server',
        category: 'endDevice',
        brand: 'Dell',
        model: 'PowerEdge R450',
        position: { x: 0.690, y: 0.170 },
        network: { ip: '192.168.1.50', mac: 'D4:BE:D9:88:99:AA', subnet: '255.255.255.0', vlan: 10, hostname: 'db-master.campus.net' },
        status: 'online',
        location: 'Ruang Server NOC Rack 02',
        firmware: 'Ubuntu Server 24.04',
        installedAt: '2026-02-01',
        notes: 'Basis data akademik & sistem informasi'
      },
      {
        id: 'dev-dist-gda',
        name: 'Dist Switch Gedung A',
        type: 'dist-switch',
        category: 'core',
        brand: 'Cisco',
        model: 'Catalyst 2960X',
        position: { x: 0.440, y: 0.195 },
        network: { ip: '192.168.10.1', mac: 'CC:D5:39:10:20:30', subnet: '255.255.255.0', vlan: 10, hostname: 'dsw-gda-lt1' },
        status: 'online',
        location: 'Gedung A (Barat Laut) Ruang Panel',
        firmware: '15.2(7)E',
        installedAt: '2026-02-10',
        notes: 'Uplink FO 10G ke Core Switch'
      },
      {
        id: 'dev-ap-gda',
        name: 'AP WiFi Gedung A',
        type: 'access-point',
        category: 'distribution',
        brand: 'Ubiquiti UniFi',
        model: 'U6-Pro',
        position: { x: 0.440, y: 0.345 },
        network: { ip: '192.168.10.15', mac: '74:83:C2:55:66:77', subnet: '255.255.255.0', vlan: 30, hostname: 'ap-gda-lobby' },
        status: 'online',
        location: 'Gedung Kelas A Sayap Selatan',
        firmware: 'UniFi 6.6.65',
        installedAt: '2026-02-12',
        wirelessCoverage: {
          enabled: true,
          radiusMeters: 28,
          color: '#76c457',
          opacity: 0.18,
          hatch: true,
          band: 'dual-band',
          showLabel: true
        },
        notes: 'SSID: Campus-Staff & Campus-Student'
      },
      {
        id: 'dev-dist-gdb',
        name: 'Dist Switch Gedung B',
        type: 'dist-switch',
        category: 'core',
        brand: 'Ruijie',
        model: 'RG-NBS3100-24GT4SFP',
        position: { x: 0.915, y: 0.270 },
        network: { ip: '192.168.20.1', mac: '58:69:6C:AA:BB:CC', subnet: '255.255.255.0', vlan: 20, hostname: 'dsw-gdb-lt1' },
        status: 'online',
        location: 'Gedung B (Timur) R. Server Mini',
        firmware: 'RGOS 11.4',
        installedAt: '2026-02-15',
        notes: 'Distribusi lab komputer dan ruang dosen'
      },
      {
        id: 'dev-ap-outdoor',
        name: 'Outdoor AP Lapangan',
        type: 'access-point',
        category: 'distribution',
        brand: 'Ubiquiti UniFi',
        model: 'U6-Mesh Outdoor',
        position: { x: 0.230, y: 0.375 },
        network: { ip: '192.168.30.5', mac: '74:83:C2:11:44:88', subnet: '255.255.255.0', vlan: 30, hostname: 'ap-outdoor-field' },
        status: 'warning',
        location: 'Tiang Lampu Lapangan Basket Utama',
        firmware: 'UniFi 6.5.54',
        installedAt: '2026-03-01',
        wirelessCoverage: {
          enabled: true,
          radiusMeters: 45,
          color: '#06b6d4',
          opacity: 0.20,
          hatch: true,
          band: '2.4ghz',
          showLabel: true
        },
        notes: 'Peringatan: Redaman link nirkabel meningkat saat hujan'
      },
      {
        id: 'dev-cctv-gate',
        name: 'IP Camera Gerbang Utara',
        type: 'cctv',
        category: 'endDevice',
        brand: 'Hikvision',
        model: 'DS-2CD2043G2-I',
        position: { x: 0.640, y: 0.065 },
        network: { ip: '192.168.100.11', mac: 'C8:02:8F:99:88:77', subnet: '255.255.255.0', vlan: 100, hostname: 'cam-main-gate' },
        status: 'online',
        location: 'Pos Satpam Gerbang Utara',
        firmware: 'V5.7.13',
        installedAt: '2026-03-05',
        notes: 'Resolusi 4MP, H.265+, IR 30m'
      }
    ];

    sampleDevices.forEach((dev) => {
      this.deviceManager.addDevice(dev);
    });

    // 2. Cables / Connections
    const sampleCables = [
      {
        id: 'cab-uplink-rtr-csw',
        name: 'Uplink Router ➔ Core Switch',
        source: 'dev-core-router',
        destination: 'dev-core-switch',
        type: 'fiber',
        cableCategory: 'fiber-sm',
        status: 'active',
        route: [],
        details: {
          fiberCoreCount: 2,
          fiberActiveCores: 'Core 1-2 (Rx/Tx 10G SFP+)',
          connectorSource: 'LC/UPC',
          connectorDest: 'LC/UPC',
          wavelength: '1310/1550nm (OS2)',
          tubeColor: 'Biru (Tube 1)'
        },
        notes: 'Direct 10G SFP+ DAC / FO patchcord NOC'
      },
      {
        id: 'cab-bb-csw-gda',
        name: 'Backbone FO NOC ➔ Gedung A',
        source: 'dev-core-switch',
        destination: 'dev-dist-gda',
        type: 'fiber',
        cableCategory: 'fiber-sm',
        status: 'active',
        route: [
          { x: 0.620, y: 0.125 },
          { x: 0.535, y: 0.125 }
        ],
        details: {
          fiberCoreCount: 12,
          fiberActiveCores: 'Core 1-2: Uplink 10G, Core 3-4: Spare',
          connectorSource: 'LC/UPC',
          connectorDest: 'LC/UPC',
          wavelength: '1310/1550nm (OS2)',
          tubeColor: 'Biru (Tube 1)'
        },
        notes: 'Jalur ducting bawah tanah via Manhole 2'
      },
      {
        id: 'cab-bb-csw-gdb',
        name: 'Backbone FO NOC ➔ Gedung B',
        source: 'dev-core-switch',
        destination: 'dev-dist-gdb',
        type: 'fiber',
        cableCategory: 'fiber-sm',
        status: 'active',
        route: [
          { x: 0.720, y: 0.120 },
          { x: 0.790, y: 0.200 },
          { x: 0.810, y: 0.270 }
        ],
        details: {
          fiberCoreCount: 24,
          fiberActiveCores: 'Core 1-2: Uplink 10G, Core 3-6: VLAN Lab, Core 7-12: Spare',
          connectorSource: 'SC/UPC',
          connectorDest: 'SC/UPC',
          wavelength: '1310/1550nm (OS2)',
          tubeColor: 'Oranye (Tube 2)'
        },
        notes: 'Jalur kabel tray luar ruangan via Gedung B'
      },
      {
        id: 'cab-srv-db',
        name: 'Link Server Database',
        source: 'dev-core-switch',
        destination: 'dev-server-db',
        type: 'ethernet',
        cableCategory: 'cat6a',
        status: 'active',
        route: [],
        details: {
          shielding: 'S/FTP',
          wiringStandard: 'T568B',
          maxBandwidth: '10 Gbps',
          poeSupport: 'none',
          portSource: 'Te1/0/48 (Core)',
          portDestination: 'eno1 (Dell R450)',
          jacketType: 'lszh'
        },
        notes: 'Kabel Cat6A Shielded dalam Rack NOC'
      },
      {
        id: 'cab-ap-gda',
        name: 'PoE AP Lobby Gedung A',
        source: 'dev-dist-gda',
        destination: 'dev-ap-gda',
        type: 'ethernet',
        cableCategory: 'cat6',
        status: 'active',
        route: [
          { x: 0.405, y: 0.255 }
        ],
        details: {
          shielding: 'U/UTP',
          wiringStandard: 'T568B',
          maxBandwidth: '1 Gbps',
          poeSupport: 'poe+',
          portSource: 'Gi1/0/12 (PoE+ 30W)',
          portDestination: 'eth0 (U6-Pro)',
          jacketType: 'indoor-pvc'
        },
        notes: 'Plafon lantai 1 Gedung A'
      },
      {
        id: 'cab-wireless-field',
        name: 'Wireless PtP Link Lapangan',
        source: 'dev-dist-gdb',
        destination: 'dev-ap-outdoor',
        type: 'wireless',
        cableCategory: 'wireless-link',
        status: 'maintenance',
        route: [],
        details: {
          frequency: '5 GHz',
          channelWidth: '40 MHz',
          signalRssi: '-55 dBm'
        },
        notes: 'Link nirkabel frekuensi 5 GHz antartiang'
      },
      {
        id: 'cab-cctv-gate',
        name: 'Jalur Kabel CCTV Gerbang',
        source: 'dev-core-switch',
        destination: 'dev-cctv-gate',
        type: 'coaxial',
        cableCategory: 'coaxial',
        status: 'active',
        route: [
          { x: 0.660, y: 0.115 }
        ],
        details: {
          coaxType: 'RG-6',
          impedance: '75 Ohm',
          coaxConnector: 'BNC Compression',
          isSiamese: true
        },
        notes: 'Jalur tepi jalan utama menuju gerbang utara'
      }
    ];

    sampleCables.forEach((cab) => {
      this.cableManager.addConnection(cab);
    });
  }
}

// Bootstrap application once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new NetMapApp();
  app.init().catch(console.error);

  // Expose to window for debugging and inspection if needed
  window.__netmap = app;
});
