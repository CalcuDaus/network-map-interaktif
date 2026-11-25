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
import { RoomDocumentationPanel } from './ui/room-doc-panel.js';
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
import { authManager } from './storage/auth-manager.js';
import { ExportModal } from './ui/export-modal.js';
import { ProjectModal } from './ui/project-modal.js';
import { AuthModal } from './ui/auth-modal.js';
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
import { DeviceDetailModal } from './ui/device-detail-modal.js';
import { BuildStudioPalette } from './ui/build-studio-palette.js';
import { NetworkSimulator } from './simulation/network-simulator.js';
import { TerminalSessionEngine } from './simulation/terminal-session-engine.js';
import { PacketTracerPanel } from './ui/packet-tracer-panel.js';
import { PtDeviceWindow } from './ui/pt-device-window.js';
import { PacketTracerTopologyEngine } from './topology/packet-tracer-canvas.js';
import { JobsheetEngine } from './learning/jobsheet-engine.js';
import { JobsheetPanel } from './ui/jobsheet-panel.js';
import { OnboardingModal } from './ui/onboarding-modal.js';
import { WorkspaceController } from './core/workspace-controller.js';
import { clamp, isMobileTouchDevice } from './utils/helpers.js';

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
    this.deviceDetailModal = null;
    this.projectStorage = null;
    this.authManager = authManager;
    this.authModal = null;
    this.exportModal = null;
    this.projectModal = null;
    this.historyManager = null;
    this.buildStudioPalette = null;
    this.networkSimulator = null;
    this.packetTracerPanel = null;
    this.workspaceController = null;
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

    // 8. Initialize Project Storage (Multi-User Server/Account + IndexedDB backup)
    this.projectStorage = new ProjectStorage({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      authManager: this.authManager
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
      this.roomDocPanel = new RoomDocumentationPanel({
        container: propertiesContainer,
        deviceManager: this.deviceManager,
        cableManager: this.cableManager,
        getMap3DEngine: () => this.map3DEngine,
        getRoom3DModal: () => this.room3DModal,
        getProjectStorage: () => this.projectStorage
      });
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
        viewportNavigator: this.viewportNavigator,
        deviceManager: this.deviceManager
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
      interactionLayer: this.mapEngine.layers.interactionLayer,
      getMap3DEngine: () => this.map3DEngine
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
    this.layerControls?.setMap3DEngine?.(this.map3DEngine);
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
    this.deviceDetailModal = new DeviceDetailModal({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      viewportNavigator: this.viewportNavigator
    });
    this.authModal = new AuthModal({
      authManager: this.authManager,
      projectStorage: this.projectStorage,
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      historyManager: this.historyManager,
      onSeedSample: () => this.seedSampleTopology()
    });
    this.setup3DControls();

    // 14f. Initialize Dual-Workspace Mode (Studio Bangunan 3D vs Lab Engineering Jaringan) & Packet Tracer
    const buildStudioContainer = document.getElementById('build-studio-palette-container');
    if (buildStudioContainer) {
      this.buildStudioPalette = new BuildStudioPalette({
        container: buildStudioContainer,
        map3DEngine: this.map3DEngine,
        room3DModal: this.room3DModal,
        object3DModal: this.object3DModal
      });
    }
    this.networkSimulator = new NetworkSimulator({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      map3DEngine: this.map3DEngine
    });
    this.terminalEngine = new TerminalSessionEngine({
      simulator: this.networkSimulator,
      deviceManager: this.deviceManager,
      getJobsheetEngine: () => this.jobsheetEngine
    });
    this.ptDeviceWindow = new PtDeviceWindow({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      simulator: this.networkSimulator,
      terminalEngine: this.terminalEngine,
      getDevice3DModelModal: () => this.device3DModelModal,
      getJobsheetEngine: () => this.jobsheetEngine
    });
    const topoContainer = document.getElementById('topology-workspace-container');
    this.packetTracerCanvas = new PacketTracerTopologyEngine({
      container: topoContainer,
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      simulator: this.networkSimulator,
      ptDeviceWindow: this.ptDeviceWindow,
      devicePalette: this.devicePalette,
      getJobsheetEngine: () => this.jobsheetEngine
    });
    this.packetTracerPanel = new PacketTracerPanel({
      simulator: this.networkSimulator,
      deviceManager: this.deviceManager,
      map3DEngine: this.map3DEngine
    });
    this.workspaceController = new WorkspaceController({
      map3DEngine: this.map3DEngine,
      buildStudioPalette: this.buildStudioPalette,
      packetTracerPanel: this.packetTracerPanel,
      ptDeviceWindow: this.ptDeviceWindow,
      packetTracerCanvas: this.packetTracerCanvas,
      deviceManager: this.deviceManager,
      cableManager: this.cableManager
    });
    this.workspaceController.init();

    eventBus.on('modal:open-device-3d-model', ({ deviceId } = {}) => {
      if (deviceId) this.device3DModelModal?.show?.(deviceId);
    });

    // 14g. Initialize Guided SMK Jobsheet Auto-Grader, Sandbox Dialog & Quick-Start Onboarding (Phase 9)
    this.jobsheetEngine = new JobsheetEngine({
      deviceManager: this.deviceManager,
      cableManager: this.cableManager,
      projectStorage: this.projectStorage,
      getMap3DEngine: () => this.map3DEngine
    });
    this.jobsheetPanel = new JobsheetPanel({
      jobsheetEngine: this.jobsheetEngine,
      projectStorage: this.projectStorage,
      getMap3DEngine: () => this.map3DEngine,
      getWorkspaceController: () => this.workspaceController
    });
    this.onboardingModal = new OnboardingModal({
      getJobsheetPanel: () => this.jobsheetPanel,
      getWorkspaceController: () => this.workspaceController,
      getAuthModal: () => this.authModal,
      getMap3DEngine: () => this.map3DEngine
    });
    this.setupPhase9Controls();

    // Global reference for modal coordination
    window.__netmapApp = this;

    // 15. Bind Modal & Action Trigger Buttons
    document.getElementById('btn-navbar-auth')?.addEventListener('click', () => {
      this.authModal?.show('login');
    });
    eventBus.on('auth:changed', () => this.updateAuthNavbarUI());
    eventBus.on('auth:workspace-mode-changed', () => this.updateAuthNavbarUI());
    eventBus.on('workspace:remote-updated', async ({ updatedBy }) => {
      if (this.authManager.getWorkspaceMode() === 'main' && !this.projectStorage.hasPendingSave) {
        await this.projectStorage.loadActiveWorkspaceProject();
        this.historyManager?.initBaseline?.();
        this.updateAuthNavbarUI();
        console.info(`[NetMap] Server Utama diperbarui oleh @${updatedBy || 'teknisi'}.`);
      }
    });
    document.getElementById('btn-open-topology')?.addEventListener('click', () => {
      if (stateManager.getWorkspaceMode?.() === 'build') return;
      this.topologyModal.show();
    });

    document.getElementById('btn-open-ip-vlan')?.addEventListener('click', () => {
      if (stateManager.getWorkspaceMode?.() === 'build') return;
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
    this.projectStorage?.syncSessionModeFromAuth?.();
    this.workspaceController?.syncSessionGuardBanner?.();

    // 20. Final icon rendering, toolbar overflow guard, PWA & Mobile Landscape/Fullscreen UX
    this.renderIcons();
    this.setupToolbarResponsiveFit();
    this.setupPwaSupport();
    this.setupMobileExperience();

    // Show Quick-Start Welcome Launcher once on first visit
    if (this.onboardingModal?.shouldAutoShowWelcome?.()) {
      setTimeout(() => {
        if (!this.authModal?.isOpen?.()) {
          this.onboardingModal.showWelcome();
        }
      }, 260);
    }

    console.info('[NetMap] Phase 9 Application ready. Complete NetMap MVP operational.');
  }

  /**
   * Bind Phase 9 controls: Master/Sandbox Guard Banner, Jobsheet triggers, Quick-Start & Shortcuts.
   */
  setupPhase9Controls() {
    const openJobsheet = () => {
      if (stateManager.getWorkspaceMode?.() === 'build') return;
      this.jobsheetPanel?.show('catalog');
    };
    const openForkDialog = () => {
      if (stateManager.getWorkspaceMode?.() === 'build') return;
      this.jobsheetPanel?.openSandboxForkDialog?.();
    };

    document.getElementById('btn-3d-jobsheet')?.addEventListener('click', openJobsheet);
    document.getElementById('btn-open-jobsheet')?.addEventListener('click', openJobsheet);
    document.getElementById('btn-banner-open-jobsheet')?.addEventListener('click', openJobsheet);
    document.getElementById('btn-banner-fork-sandbox')?.addEventListener('click', openForkDialog);
    document.getElementById('btn-banner-reset-sandbox')?.addEventListener('click', () => {
      this.projectStorage?.resetPracticeSandbox?.();
    });
    document.getElementById('btn-banner-return-master')?.addEventListener('click', () => {
      this.projectStorage?.returnToMasterProject?.();
    });

    document.getElementById('btn-open-welcome')?.addEventListener('click', () => {
      this.onboardingModal?.showWelcome?.();
    });
    document.getElementById('btn-open-shortcuts')?.addEventListener('click', () => {
      this.onboardingModal?.showShortcuts?.();
    });

    // Quick-toggle triggers inside 'Tampilan 3D' popover
    document.getElementById('btn-3d-building-labels-quick')?.addEventListener('click', (e) => {
      if (!this.map3DEngine) return;
      const next = !Boolean(this.map3DEngine.showBuildingSignboards);
      this.map3DEngine.setShowBuildingSignboards(next);
      e.currentTarget?.classList?.toggle('active', next);
    });
    document.getElementById('btn-3d-quality-quick')?.addEventListener('click', (e) => {
      if (!this.map3DEngine) return;
      const next = this.map3DEngine.getGraphicsQuality?.() === 'lite' ? 'standard' : 'lite';
      this.map3DEngine.setGraphicsQuality?.(next);
      const lbl = e.currentTarget?.querySelector?.('span');
      if (lbl) lbl.textContent = next === 'lite' ? 'Kualitas: Hemat HP' : 'Kualitas: Standar';
    });

    eventBus.on('ui:open-sandbox-fork', openForkDialog);
    eventBus.on('auth:changed', () => {
      this.projectStorage?.syncSessionModeFromAuth?.();
      this.workspaceController?.syncSessionGuardBanner?.();
    });
    eventBus.on('auth:workspace-mode-changed', () => {
      this.projectStorage?.syncSessionModeFromAuth?.();
      this.workspaceController?.syncSessionGuardBanner?.();
    });
  }

  setupToolbarResponsiveFit() {
    const toolbar = document.getElementById('app-toolbar');
    if (!toolbar) return;

    this._lastToolbarWidth = 0;
    const runSync = () => this.syncToolbarLayoutFit();

    window.addEventListener('resize', runSync);
    eventBus.on('workspace:changed', () => requestAnimationFrame(runSync));
    eventBus.on('auth:changed', () => requestAnimationFrame(runSync));
    if (typeof ResizeObserver !== 'undefined') {
      this._toolbarResizeObserver = new ResizeObserver(() => {
        const w = toolbar.clientWidth;
        if (w !== this._lastToolbarWidth) {
          this._lastToolbarWidth = w;
          runSync();
        }
      });
      this._toolbarResizeObserver.observe(toolbar);
    }
    if (document.fonts?.ready) {
      document.fonts.ready.then(runSync).catch(() => { });
    }
    requestAnimationFrame(runSync);
  }

  syncToolbarLayoutFit() {
    const toolbar = document.getElementById('app-toolbar');
    if (!toolbar) return;

    const stages = [
      'tb-compact-brand',
      'tb-compact-zoom',
      'tb-compact-modes',
      'tb-compact-view',
      'tb-compact-extras',
      'tb-compact-auth',
      'tb-wrap'
    ];
    toolbar.classList.remove(...stages);

    const available = toolbar.clientWidth;
    if (!available) return;

    const rightEdgeBtn =
      document.getElementById('btn-toggle-fullscreen') ||
      document.getElementById('btn-navbar-settings');
    const isOverflowing = () => {
      if (toolbar.scrollWidth > available + 1) return true;
      if (rightEdgeBtn && rightEdgeBtn.getBoundingClientRect().right > available - 2) return true;
      return false;
    };

    for (const cls of stages) {
      if (!isOverflowing()) break;
      toolbar.classList.add(cls);
    }
  }

  renderIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  updateAuthNavbarUI() {
    const btn = document.getElementById('btn-navbar-auth');
    const labelEl = document.getElementById('navbar-auth-label');
    const badgeEl = document.getElementById('navbar-auth-ws-badge');
    const isAuth = this.authManager.isAuthenticated();
    const user = this.authManager.getCurrentUser();
    const wsMode = this.authManager.getWorkspaceMode();
    const isPublic = !isAuth && this.authManager.isPublicPreviewActive?.();

    btn?.classList.toggle('is-authenticated', isAuth);
    if (labelEl) {
      labelEl.textContent = isAuth
        ? (user?.displayName || user?.username || 'Teknisi')
        : (isPublic ? 'Lihat Publik' : 'Mode Tamu');
    }
    const mobAuthLabel = document.getElementById('mob-auth-label');
    if (mobAuthLabel) {
      mobAuthLabel.textContent = isAuth
        ? (user?.username || 'Teknisi')
        : (isPublic ? 'Publik' : 'Masuk');
    }
    document.getElementById('btn-mob-auth')?.classList.toggle('active', isAuth);
    if (badgeEl) {
      badgeEl.textContent = isAuth
        ? (wsMode === 'personal'
          ? 'Akun Saya'
          : (this.authManager.isMainWorkspaceUnlocked?.() ? 'Server Utama' : 'Terkunci'))
        : (isPublic ? 'Read-Only' : 'Masuk');
    }
    const status = !isAuth
      ? (isPublic ? 'public-readonly' : 'guest')
      : (!this.authManager.canWriteActiveWorkspace?.()
        ? 'readonly-main'
        : (this.projectStorage.hasPendingSave ? 'saving' : 'saved'));
    this.projectStorage?.updateStatusIndicator(status);
    this.syncToolbarLayoutFit();
  }

  /**
   * Check active session:
   * - Guest (not logged in): bebas memakai app tanpa data tersimpan (kanvas kosong)
   * - Logged in: muat workspace aktif (Server Utama atau Akun Pribadi)
   */
  async loadOrSeedProject() {
    try {
      await this.authManager.initSession();
      this.updateAuthNavbarUI();

      if (!this.authManager.isAuthenticated()) {
        console.info('[NetMap] Mode Tamu aktif: kanvas dimulai kosong tanpa data tersimpan.');
        this.projectStorage.clearCanvasToEmpty('SmartSchool NetMap');
      } else {
        const res = await this.projectStorage.loadActiveWorkspaceProject();
        if (res.loaded) {
          console.info(`[NetMap] Workspace "${res.workspaceKey}" berhasil dimuat.`);
        } else {
          console.info(`[NetMap] Workspace "${res.workspaceKey || 'main'}" masih kosong siap dikerjakan.`);
        }
      }
    } catch (err) {
      console.warn('[NetMap] Gagal memuat session/workspace awal, mulai kanvas kosong:', err);
      this.projectStorage.clearCanvasToEmpty('SmartSchool NetMap');
    }

    this.updateAuthNavbarUI();
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

    // Handle Click-to-Place in Add Device mode (supports both 2D stage and 3D floor/building placement)
    eventBus.on('canvas:place-device', ({ normalizedX, normalizedY, customDeviceData, elevationMeters }) => {
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

        if (typeof elevationMeters === 'number' && Number.isFinite(elevationMeters)) {
          deviceData.spatial3d = { ...(deviceData.spatial3d || {}), elevationMeters };
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
    const btnTopology = document.getElementById('btn-view-topology');
    const btn2d = document.getElementById('btn-view-2d');
    const btn3d = document.getElementById('btn-view-3d');
    const topoContainer = document.getElementById('topology-workspace-container');
    const konvaContainer = document.getElementById('konva-stage-container');
    const map3dContainer = document.getElementById('map-3d-container');
    const hud3d = document.getElementById('hud-3d-controls');
    const hud3dHints = document.getElementById('hud-3d-hints');
    const hud2dZoom = document.querySelector('.map-hud-controls');
    const hudCompass = document.getElementById('hud-compass');

    const applyViewMode = (mode) => {
      const isTopology = mode === 'topology';
      const is3d = mode === '3d';
      const is2d = !is3d && !isTopology;

      btnTopology?.classList.toggle('active', isTopology);
      btn2d?.classList.toggle('active', is2d);
      btn3d?.classList.toggle('active', is3d);

      topoContainer?.classList.toggle('hidden', !isTopology);
      if (topoContainer) topoContainer.style.display = isTopology ? 'block' : 'none';

      konvaContainer?.classList.toggle('hidden', !is2d);
      if (konvaContainer) konvaContainer.style.display = is2d ? '' : 'none';
      hud2dZoom?.classList.toggle('hidden', !is2d);
      if (hud2dZoom) hud2dZoom.style.display = is2d ? '' : 'none';
      hudCompass?.classList.toggle('hidden', !is2d);
      if (hudCompass) hudCompass.style.display = is2d ? '' : 'none';

      map3dContainer?.classList.toggle('hidden', !is3d);
      if (map3dContainer) map3dContainer.style.display = is3d ? 'block' : 'none';
      hud3d?.classList.toggle('hidden', !is3d);
      if (hud3d) hud3d.style.display = is3d ? 'flex' : 'none';
      if (is3d) {
        this._apply3dHudMinimizeState?.();
      }
      hud3dHints?.classList.toggle('hidden', !is3d);
      if (hud3dHints) hud3dHints.style.display = is3d ? 'flex' : 'none';
      const hud3dSimInspector = document.getElementById('hud-3d-sim-inspector');
      if (!is3d && hud3dSimInspector) {
        hud3dSimInspector.classList.add('hidden');
        hud3dSimInspector.style.display = 'none';
      }
      const hud3dAvatarBar = document.getElementById('hud-3d-avatar-bar');
      if (!is3d && hud3dAvatarBar) {
        hud3dAvatarBar.classList.add('hidden');
        hud3dAvatarBar.style.display = 'none';
      }

      if (isTopology) {
        this.map3DEngine?.deactivate();
        this.packetTracerCanvas?.activate?.();
      } else if (is3d) {
        this.packetTracerCanvas?.deactivate?.();
        this.map3DEngine?.activate();
        const coverageToggle = document.getElementById('filter-toggle-coverage');
        if (coverageToggle) {
          this.map3DEngine?.setShowCoverage(Boolean(coverageToggle.checked));
        }
      } else {
        this.packetTracerCanvas?.deactivate?.();
        this.map3DEngine?.deactivate();
      }
    };

    // Enforce initial view state immediately on boot
    applyViewMode(stateManager.getViewMode());

    btnTopology?.addEventListener('click', () => {
      if (stateManager.getWorkspaceMode?.() === 'build') return;
      stateManager.setViewMode('topology');
    });
    btn2d?.addEventListener('click', () => stateManager.setViewMode('2d'));
    btn3d?.addEventListener('click', () => stateManager.setViewMode('3d'));

    eventBus.on('viewmode:changed', ({ viewMode }) => {
      applyViewMode(viewMode);
    });

    // SketchUp Navigation Tool Buttons (Orbit, Pan, Zoom, Look, Move, Rotate, Box Select, Draw 3D)
    const navToolButtons = [
      { id: 'btn-3d-tool-orbit', tool: 'orbit' },
      { id: 'btn-3d-tool-pan', tool: 'pan' },
      { id: 'btn-3d-tool-zoom', tool: 'zoom' },
      { id: 'btn-3d-tool-look', tool: 'look' },
      { id: 'btn-3d-tool-move', tool: 'move' },
      { id: 'btn-3d-tool-rotate', tool: 'rotate' },
      { id: 'btn-3d-tool-box', tool: 'box' },
      { id: 'btn-3d-tool-draw3d', tool: 'draw3d' },
      { id: 'btn-3d-tool-road', tool: 'road3d' }
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

    // Simulator Auto-Focus on Device Click toggle
    const btnAutoFocus = document.getElementById('btn-3d-autofocus');
    if (btnAutoFocus && this.map3DEngine) {
      btnAutoFocus.classList.toggle('active', Boolean(this.map3DEngine.autoFocusOnClick));
      btnAutoFocus.addEventListener('click', () => {
        const nextState = this.map3DEngine.toggleAutoFocusOnClick();
        btnAutoFocus.classList.toggle('active', nextState);
      });
    }

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

    // Labels toggle (synced bidirectionally with layer:annotations)
    const btnLabels = document.getElementById('btn-3d-labels');
    if (btnLabels) {
      btnLabels.classList.toggle('active', stateManager.state?.layers?.annotations !== false);
      btnLabels.addEventListener('click', () => {
        const cur = this.map3DEngine
          ? Boolean(this.map3DEngine.showLabels)
          : stateManager.state?.layers?.annotations !== false;
        const next = !cur;
        btnLabels.classList.toggle('active', next);
        if (this.map3DEngine) {
          this.map3DEngine.setShowLabels(next);
        } else {
          stateManager.toggleLayer('annotations', next);
        }
      });
    }

    // 1-Click Building X-Ray Mode toggle (Shortcut: X)
    const btnXray = document.getElementById('btn-3d-xray');
    btnXray?.addEventListener('click', () => {
      this.map3DEngine?.toggleBuildingXrayMode?.();
    });

    // Mode Teknisi (Roblox-like 3D character walker) & FPP toggles
    const btnAvatar = document.getElementById('btn-3d-avatar');
    const btnFpp = document.getElementById('btn-3d-fpp');
    btnAvatar?.addEventListener('click', () => {
      this.map3DEngine?.toggleAvatarMode();
    });
    btnFpp?.addEventListener('click', () => {
      if (!this.map3DEngine) return;
      if (this.map3DEngine.avatarMode && this.map3DEngine.avatarPerspective === 'fpp') {
        this.map3DEngine.setAvatarPerspective('tpp');
      } else {
        this.map3DEngine.setAvatarPerspective('fpp');
      }
    });

    // Minimize / Expand toggles for #hud-3d-controls and #hud-3d-hints (persisted in localStorage)
    const CONTROLS_MIN_KEY = 'netmap_hud3d_controls_min';
    const HINTS_MIN_KEY = 'netmap_hud3d_hints_min';
    const btnToggleControls = document.getElementById('btn-3d-toggle-controls');
    const btnToggleHints = document.getElementById('btn-3d-toggle-hints');
    const btnMenuToggle3dNav = document.getElementById('btn-menu-toggle-3d-nav');
    const btnMenuToggle3dHints = document.getElementById('btn-menu-toggle-3d-hints');
    document.getElementById('btn-settings-open-doors')?.addEventListener('click', () => {
      this.map3DEngine?.setAllInteractiveDoorsOpen?.(true);
    });
    document.getElementById('btn-settings-close-doors')?.addEventListener('click', () => {
      this.map3DEngine?.setAllInteractiveDoorsOpen?.(false);
    });

    // Mode Hemat Grafis HP ('lite' <-> 'standard') in Settings dropdown
    const btn3dQuality = document.getElementById('btn-settings-3d-quality');
    const badge3dQuality = document.getElementById('badge-menu-3d-quality');
    const syncQualityBadge = () => {
      if (!badge3dQuality || !this.map3DEngine) return;
      const q = this.map3DEngine.getGraphicsQuality?.() || 'standard';
      badge3dQuality.textContent = q === 'lite' ? 'Hemat HP' : 'Standar';
    };
    syncQualityBadge();
    btn3dQuality?.addEventListener('click', () => {
      if (!this.map3DEngine) return;
      const next = this.map3DEngine.getGraphicsQuality?.() === 'lite' ? 'standard' : 'lite';
      this.map3DEngine.setGraphicsQuality?.(next);
      syncQualityBadge();
    });
    eventBus.on('map3d:quality-changed', syncQualityBadge);

    // Direct 1-tap open simulator from 3D Port Inspector (#hud-3d-sim-inspector)
    eventBus.on('modal:open-simulator', ({ deviceId = null, tab = 'winbox' } = {}) => {
      if (stateManager.getWorkspaceMode?.() === 'build') {
        this.map3DEngine?.showStatusHint?.('Simulasi & CLI dinonaktifkan saat Mode Edit Bangunan. Pindah ke Simulasi Jaringan untuk mengaksesnya.');
        return;
      }
      this.packetTracerPanel?.show?.(tab || 'winbox', deviceId || null);
    });
    const badgeMenu3dNav = document.getElementById('badge-menu-3d-nav');
    const badgeMenu3dHints = document.getElementById('badge-menu-3d-hints');

    let isControlsMinimized = false;
    let isHintsMinimized = false;
    try {
      isControlsMinimized = localStorage.getItem(CONTROLS_MIN_KEY) === '1';
      isHintsMinimized = localStorage.getItem(HINTS_MIN_KEY) === '1';
    } catch { /* ignore storage errors */ }

    const applyHudMinimizeState = () => {
      hud3d?.classList.toggle('is-minimized', isControlsMinimized);
      if (btnToggleControls) {
        btnToggleControls.setAttribute('aria-expanded', String(!isControlsMinimized));
        btnToggleControls.title = isControlsMinimized
          ? 'Tampilkan Bar Navigasi 3D'
          : 'Minimize Bar Navigasi 3D';
      }
      if (badgeMenu3dNav) {
        badgeMenu3dNav.textContent = isControlsMinimized ? 'Minimal' : 'Tampil';
      }

      hud3dHints?.classList.toggle('is-minimized', isHintsMinimized);
      if (btnToggleHints) {
        btnToggleHints.setAttribute('aria-expanded', String(!isHintsMinimized));
        btnToggleHints.title = isHintsMinimized
          ? 'Tampilkan Panduan Kontrol 3D'
          : 'Minimize Panduan Kontrol 3D';
      }
      if (badgeMenu3dHints) {
        badgeMenu3dHints.textContent = isHintsMinimized ? 'Minimal' : 'Tampil';
      }
    };

    const toggleControlsMin = () => {
      const currentlyMin = hud3d ? hud3d.classList.contains('is-minimized') : isControlsMinimized;
      this.set3DControlsMinimized(!currentlyMin);
    };

    this._apply3dHudMinimizeState = applyHudMinimizeState;
    this.set3DControlsMinimized = (minimized) => {
      isControlsMinimized = Boolean(minimized);
      try { localStorage.setItem(CONTROLS_MIN_KEY, isControlsMinimized ? '1' : '0'); } catch { /* ignore */ }
      applyHudMinimizeState();
      return isControlsMinimized;
    };

    const toggleHintsMin = () => {
      isHintsMinimized = !isHintsMinimized;
      try { localStorage.setItem(HINTS_MIN_KEY, isHintsMinimized ? '1' : '0'); } catch { /* ignore */ }
      applyHudMinimizeState();
    };

    applyHudMinimizeState();
    btnToggleControls?.addEventListener('click', toggleControlsMin);
    btnToggleHints?.addEventListener('click', toggleHintsMin);
    btnMenuToggle3dNav?.addEventListener('click', toggleControlsMin);
    btnMenuToggle3dHints?.addEventListener('click', toggleHintsMin);

    // Rooms, 3D Object Studio & Device 3D Model Modals
    document.getElementById('btn-3d-rooms')?.addEventListener('click', () => {
      this.room3DModal?.show();
    });
    this.map3DEngine?.bindRoomLockButton?.();
    this.map3DEngine?.syncRoomLockUI?.();
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

    // Focus single building / room in 3D from SearchUI or Building Documentation Card
    eventBus.on('map3d:focus-room', ({ roomId }) => {
      if (!roomId) return;
      if (stateManager.getViewMode() !== '3d') {
        stateManager.setViewMode('3d');
      }
      setTimeout(() => {
        this.map3DEngine?.focusOnRoom3d?.(roomId);
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
      // Don't trigger shortcuts if typing inside a text input, textarea, select, or contentEditable
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName;
      const inputType = tag === 'INPUT' ? String(activeEl.type || 'text').toLowerCase() : '';
      const isTextInput =
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(activeEl?.isContentEditable) ||
        (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color', 'submit', 'reset'].includes(inputType));
      if (isTextInput) {
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

      // Don't trigger map shortcuts while DeviceDetailModal or AuthModal is open
      if (this.deviceDetailModal?.isOpen() || this.authModal?.isOpen()) {
        return;
      }

      // Global Shortcut Cheat-Sheet Modal (?)
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.onboardingModal?.showShortcuts?.();
        return;
      }

      // Live Z elevation shortcuts in 3D view (PageUp/PageDown in Mode Teknisi or on selected device; ArrowUp/ArrowDown while carrying)
      if (stateManager.getViewMode() === '3d' && !e.ctrlKey && !e.metaKey) {
        const isPgUpDn = (e.key === 'PageUp' || e.key === 'PageDown')
          && (this.map3DEngine?.avatarMode || Boolean(this.deviceManager?.selectedDeviceId));
        const isCarryingArrowZ =
          this.map3DEngine?.avatarMode &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          ((Array.isArray(this.map3DEngine.carriedObjects) && this.map3DEngine.carriedObjects.length > 0) ||
            Boolean(this.map3DEngine.activeCablePull));
        if (isPgUpDn || isCarryingArrowZ) {
          e.preventDefault();
          const mag = e.shiftKey ? 0.1 : (e.altKey ? 0.5 : 0.25);
          const sign = (e.key === 'PageUp' || e.key === 'ArrowUp') ? 1 : -1;
          if (this.map3DEngine.activeCablePull) {
            this.map3DEngine.adjustAvatarCablePullElevation(sign * mag);
          } else {
            this.map3DEngine.adjustAvatarTargetOrCarriedElevation(sign * mag);
          }
          return;
        }
      }

      // Arrow key nudging for selected device(s) (or selected 3D object/room) in both 2D and 3D mode (including Mode Teknisi)
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
        !e.ctrlKey && !e.metaKey &&
        this.nudgeSelectionByArrowKey(e)
      ) {
        e.preventDefault();
        return;
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
        if (lower === 'r') {
          e.preventDefault();
          if (this.map3DEngine?.carriedObjects?.length > 0 || this.map3DEngine?.navTool === 'move') {
            this.map3DEngine?.rotateSelectedIn3D({ dY: e.shiftKey ? -45 : 45 });
          } else {
            this.map3DEngine?.setNavTool('rotate');
          }
          return;
        }
        if (e.key === '[' || e.key === '{') {
          e.preventDefault();
          this.map3DEngine?.rotateSelectedIn3D(e.shiftKey ? { dX: -15 } : { dY: -15 });
          return;
        }
        if (e.key === ']' || e.key === '}') {
          e.preventDefault();
          this.map3DEngine?.rotateSelectedIn3D(e.shiftKey ? { dX: 15 } : { dY: 15 });
          return;
        }
        if ((e.key === '+' || e.key === '=') && stateManager.getSelectedRoom3dId?.()) {
          e.preventDefault();
          this.map3DEngine?.scaleSelectedRoomIn3D(e.shiftKey ? 1.25 : 1.1);
          return;
        }
        if ((e.key === '-' || e.key === '_') && stateManager.getSelectedRoom3dId?.()) {
          e.preventDefault();
          this.map3DEngine?.scaleSelectedRoomIn3D(e.shiftKey ? 0.8 : 0.9);
          return;
        }
        if (lower === 'b') {
          e.preventDefault();
          if (this.map3DEngine?.avatarMode || e.shiftKey) {
            this.map3DEngine?.toggleBuildMode?.();
          } else {
            this.map3DEngine?.setNavTool('box');
          }
          return;
        }
        if (lower === 'p') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('draw3d');
          this.object3DModal?.show();
          return;
        }
        if (lower === 'n') {
          e.preventDefault();
          this.map3DEngine?.setNavTool('road3d');
          return;
        }
        if (e.key === 'Enter' && this.map3DEngine?.roadBuildState) {
          e.preventDefault();
          this.map3DEngine.finishActiveRoadBuild();
          return;
        }
        if (e.key === 'Backspace' && this.map3DEngine?.navTool === 'road3d' && this.map3DEngine?.roadBuildState) {
          e.preventDefault();
          this.map3DEngine.undoLastRoadBuildPoint();
          return;
        }
        if (lower === 'g' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.map3DEngine?.toggleAvatarMode();
          return;
        }
        if (lower === 'x' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.map3DEngine?.toggleBuildingXrayMode?.();
          return;
        }
        if (lower === 'v' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (this.map3DEngine?.avatarMode) {
            this.map3DEngine.toggleAvatarPerspective();
          } else {
            this.map3DEngine?.setAvatarMode(true, { perspective: 'fpp' });
          }
          return;
        }
        if (/^[1-9]$/.test(e.key) && this.map3DEngine?.avatarMode && this.map3DEngine?.activeCablePull && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const idx = Number(e.key) - 1;
          const pull = this.map3DEngine.activeCablePull;
          const aim = this.map3DEngine.computeAvatarCableAimTarget();
          const destId = (aim?.kind === 'device' && aim.deviceId && aim.deviceId !== pull.sourceDeviceId)
            ? aim.deviceId
            : (pull.targetDeviceId && pull.targetDeviceId !== pull.sourceDeviceId ? pull.targetDeviceId : null);
          if (destId) {
            const dstPorts = this.map3DEngine.getDevicePortsStatusList(destId);
            const chosen = dstPorts[idx];
            if (chosen && !chosen.occupied) {
              this.map3DEngine.setActiveCablePullTargetPort(destId, chosen.name);
            } else if (chosen?.occupied) {
              this.map3DEngine.showStatusHint(`Port tujuan ${chosen.name} sudah terpakai.`);
            }
          } else {
            const srcPorts = this.map3DEngine.getDevicePortsStatusList(pull.sourceDeviceId);
            const chosen = srcPorts[idx];
            if (chosen) {
              this.map3DEngine.setActiveCablePullSourcePort(chosen.name);
            }
          }
          return;
        }
        if (lower === 'c' && this.map3DEngine?.avatarMode && !e.ctrlKey && !e.metaKey) {
          if (stateManager.getWorkspaceMode?.() === 'build') return;
          e.preventDefault();
          if (this.map3DEngine.activeCablePull) {
            this.map3DEngine.placeAvatarCableClip({ shiftKey: Boolean(e.shiftKey) });
          } else {
            this.map3DEngine.startAvatarCablePull();
          }
          return;
        }
        if (e.key === 'Backspace' && this.map3DEngine?.avatarMode && this.map3DEngine?.activeCablePull) {
          if (stateManager.getWorkspaceMode?.() === 'build') return;
          e.preventDefault();
          this.map3DEngine.undoAvatarCableClip();
          return;
        }
        if (lower === 'f' && this.map3DEngine?.avatarMode && !e.ctrlKey && !e.metaKey) {
          if (stateManager.getWorkspaceMode?.() === 'build') return;
          e.preventDefault();
          if (this.map3DEngine.activeCablePull) {
            this.map3DEngine.placeAvatarCableClip({ shiftKey: Boolean(e.shiftKey) });
          } else {
            this.map3DEngine.inspectNearestDeviceFromAvatar();
          }
          return;
        }
        if (lower === 'e' && this.map3DEngine?.avatarMode && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (this.map3DEngine.activeCablePull) {
            const pull = this.map3DEngine.activeCablePull;
            const aim = this.map3DEngine.computeAvatarCableAimTarget({ shiftKey: Boolean(e.shiftKey) });
            const destId = (aim?.kind === 'device' && aim.deviceId && aim.deviceId !== pull.sourceDeviceId)
              ? aim.deviceId
              : (pull.targetDeviceId && pull.targetDeviceId !== pull.sourceDeviceId ? pull.targetDeviceId : null);
            const destPort = (aim?.kind === 'device' && aim.deviceId === destId)
              ? (aim.portName || pull.targetPort || '')
              : (pull.targetPort || '');
            if (destId) {
              this.map3DEngine.finishAvatarCablePull(destId, destPort);
            } else {
              this.map3DEngine.placeAvatarCableClip({ shiftKey: Boolean(e.shiftKey), aimTarget: aim });
            }
          } else if (stateManager.getMode() === 'draw-cable' || this.map3DEngine.pendingCableSourceId) {
            this.map3DEngine.showStatusHint?.('Selesaikan atau batalkan penarikan kabel terlebih dahulu sebelum mengangkat perangkat.');
          } else if (this.map3DEngine.carriedObjects?.length > 0 && !e.shiftKey) {
            this.map3DEngine.dropCarriedObjectsFromAvatar({ dropAll: false, useAimTarget: true });
          } else if (typeof this.map3DEngine.interactOrPickupFromAvatar === 'function' && !e.shiftKey) {
            this.map3DEngine.interactOrPickupFromAvatar();
          } else {
            this.map3DEngine.pickupNearestObjectFromAvatar();
          }
          return;
        }
        if (lower === 'q' && this.map3DEngine?.avatarMode && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.map3DEngine.dropCarriedObjectsFromAvatar({ dropAll: Boolean(e.shiftKey), useAimTarget: true });
          return;
        }
        if ((e.key === ',' || e.key === '<') && this.map3DEngine?.avatarMode && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.map3DEngine.setAvatarMouseSensitivity(
            Math.round((this.map3DEngine.getAvatarMouseSensitivity() - 0.1) * 100) / 100
          );
          return;
        }
        if ((e.key === '.' || e.key === '>') && this.map3DEngine?.avatarMode && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.map3DEngine.setAvatarMouseSensitivity(
            Math.round((this.map3DEngine.getAvatarMouseSensitivity() + 0.1) * 100) / 100
          );
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          this.map3DEngine?.zoomExtents();
          return;
        }
        if (lower === 'd' && e.shiftKey && this.deviceManager?.selectedDeviceId) {
          if (stateManager.getWorkspaceMode?.() === 'build') return;
          e.preventDefault();
          this.deviceDetailModal?.show(this.deviceManager.selectedDeviceId, 'overview');
          return;
        }
        if (['w', 'a', 's', 'd', 'q', 'e'].includes(lower)) {
          return; // Handled smoothly by Map3DEngine walk loop
        }
        if (e.key === 'Escape') {
          if (this.map3DEngine?.activeCablePull) {
            this.map3DEngine.cancelAvatarCablePull();
            return;
          }
          if (this.map3DEngine?.roadBuildState) {
            this.map3DEngine.finishActiveRoadBuild();
            return;
          }
          if (this.map3DEngine?.pendingCableSourceId && !this.map3DEngine.simulatorFocusedDeviceId) {
            this.map3DEngine.pendingCableSourceId = null;
            this.map3DEngine.pendingCableSourcePort = '';
            this.map3DEngine.syncDevices();
            this.map3DEngine.syncCables();
            return;
          }
          if (this.map3DEngine?.simulatorFocusedDeviceId) {
            // Exit port focus cleanly while keeping the device selected for arrow-key adjustment
            this.map3DEngine.exitSimulatorFocus({ restoreCamera: true });
            return;
          }
          this.deviceManager.deselectDevice();
          this.cableManager.deselectConnection();
          stateManager.deselectObject3d?.();
          stateManager.deselectRoom3d?.();
          stateManager.deselectRoad3d?.();
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
        case 'd':
        case 'D':
          if (stateManager.getWorkspaceMode?.() === 'build') break;
          if (!e.ctrlKey && !e.metaKey && this.deviceManager?.selectedDeviceId) {
            e.preventDefault();
            this.deviceDetailModal?.show(this.deviceManager.selectedDeviceId, 'overview');
          }
          break;
        case 'Delete':
        case 'Backspace': {
          if (this.deleteCurrentSelection()) {
            e.preventDefault();
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

  nudgeSelectionByArrowKey(e) {
    const key = e?.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return false;

    const step = e.shiftKey ? 0.015 : (e.altKey ? 0.001 : 0.004);
    let dx = 0;
    let dy = 0;
    if (key === 'ArrowLeft') dx = -step;
    else if (key === 'ArrowRight') dx = step;
    else if (key === 'ArrowUp') dy = -step;
    else if (key === 'ArrowDown') dy = step;

    let selectedDeviceIds = this.deviceManager?.getSelectedDeviceIds?.() || [];
    if (selectedDeviceIds.length === 0 && this.deviceManager?.selectedDeviceId) {
      selectedDeviceIds = [this.deviceManager.selectedDeviceId];
    }

    const hasSelObjOrRoom = stateManager.getViewMode() === '3d' && (
      Boolean(stateManager.getSelectedObject3dId?.()) ||
      Boolean(stateManager.getSelectedRoom3dId?.()) ||
      Boolean(stateManager.getSelectedRoad3dId?.())
    );

    if (selectedDeviceIds.length === 0 && !hasSelObjOrRoom) {
      const fallbackId =
        this.propertiesPanel?.currentDevice?.id ||
        this.map3DEngine?.simulatorFocusedDeviceId ||
        (this.map3DEngine?.avatarMode ? this.map3DEngine?.avatarState?.nearestDeviceId : null) ||
        this.deviceManager?.lastInteractedDeviceId ||
        null;
      if (fallbackId && this.deviceManager?.getDeviceById?.(fallbackId)) {
        this.deviceManager.selectDevice(fallbackId);
        selectedDeviceIds = this.deviceManager.getSelectedDeviceIds();
      }
    }

    if (selectedDeviceIds.length > 0) {
      const moved = this.deviceManager.nudgeSelectedDevices(dx, dy, { syncRenderer: true });
      if (moved.length === 0) {
        this.map3DEngine?.showStatusHint?.('Perangkat yang dipilih terkunci pada Layer.');
        return true;
      }
      if (moved.length === 1 && typeof document !== 'undefined') {
        const coordStatus = document.getElementById('status-coordinates');
        if (coordStatus) {
          coordStatus.textContent = `X: ${moved[0].position.x.toFixed(4)}, Y: ${moved[0].position.y.toFixed(4)}`;
        }
      }
      if (stateManager.getViewMode() === '3d') {
        this.map3DEngine?.syncDevices?.();
        this.map3DEngine?.syncCables?.();
        this.map3DEngine?.flashMoveElevationGuide?.(moved.map((d) => d.id));
        const hint = moved.length === 1
          ? `Posisi "${moved[0].name}" (X: ${moved[0].position.x.toFixed(4)}, Y: ${moved[0].position.y.toFixed(4)}) — Shift=cepat • Alt=halus`
          : `Posisi ${moved.length} perangkat digeser (Shift=cepat • Alt=halus)`;
        this.map3DEngine?.showStatusHint?.(hint);
      }
      return true;
    }

    if (stateManager.getViewMode() === '3d') {
      const selObjId = stateManager.getSelectedObject3dId?.();
      if (selObjId) {
        const obj = stateManager.getObject3dById?.(selObjId);
        if (!obj) return false;
        if (this.map3DEngine?.isObject3dLocked?.(obj)) {
          this.map3DEngine?.showStatusHint?.(`Objek/Ruangan "${obj.name}" sedang dikunci.`);
          return true;
        }
        const prevX = Number(obj.x) || 0;
        const prevY = Number(obj.y) || 0;
        const newX = clamp(Number((prevX + dx).toFixed(4)), 0, 1);
        const newY = clamp(Number((prevY + dy).toFixed(4)), 0, 1);
        const actualDx = newX - prevX;
        const actualDy = newY - prevY;
        stateManager.updateObject3d?.(obj.id, { x: newX, y: newY });

        const mountedMoves = [];
        this.deviceManager?.getAllDevices?.()?.forEach((dev) => {
          if (dev.spatial3d?.mountedOnObjectId === obj.id && !dev.layerLocked && dev.position) {
            mountedMoves.push({
              id: dev.id,
              position: {
                x: clamp(Number((Number(dev.position.x) + actualDx).toFixed(4)), 0, 1),
                y: clamp(Number((Number(dev.position.y) + actualDy).toFixed(4)), 0, 1)
              }
            });
          }
        });
        if (mountedMoves.length > 0) {
          this.deviceManager.moveDeviceGroup(mountedMoves, { syncRenderer: true });
          this.map3DEngine?.syncDevices?.();
          this.map3DEngine?.syncCables?.();
        }
        this.map3DEngine?.showStatusHint?.(`Objek "${obj.name}" (X: ${newX.toFixed(4)}, Y: ${newY.toFixed(4)})`);
        return true;
      }

      const selRoomId = stateManager.getSelectedRoom3dId?.();
      if (selRoomId) {
        const room = stateManager.getRoom3dById?.(selRoomId);
        if (!room) return false;
        if (this.map3DEngine?.isRoomLocked?.(room)) {
          this.map3DEngine?.showStatusHint?.(`Ruangan "${room.name}" sedang dikunci.`);
          return true;
        }
        const newX = clamp(Number(((Number(room.x) || 0) + dx).toFixed(4)), 0, 1);
        const newY = clamp(Number(((Number(room.y) || 0) + dy).toFixed(4)), 0, 1);
        stateManager.updateRoom3d?.(room.id, { x: newX, y: newY });
        this.map3DEngine?.showStatusHint?.(`Ruangan "${room.name}" (X: ${newX.toFixed(4)}, Y: ${newY.toFixed(4)})`);
        return true;
      }

      const selRoadId = stateManager.getSelectedRoad3dId?.();
      if (selRoadId && this.map3DEngine?.getWorldDimensions) {
        const dims = this.map3DEngine.getWorldDimensions();
        return this.map3DEngine.nudgeSelectedRoad3d(dx * (dims.worldW || 100), dy * (dims.worldD || 80));
      }
    }

    return false;
  }

  deleteCurrentSelection() {
    const selectedIds = this.deviceManager?.getSelectedDeviceIds?.() || [];
    if (selectedIds.length > 1) {
      if (confirm(`Hapus ${selectedIds.length} perangkat terpilih beserta seluruh kabelnya?`)) {
        this.deviceManager.deleteSelectedDevices();
      }
      return true;
    }
    if (this.deviceManager?.selectedDeviceId) {
      const curDev = this.deviceManager.getDeviceById(this.deviceManager.selectedDeviceId);
      if (curDev && confirm(`Hapus perangkat "${curDev.name}" beserta seluruh kabelnya?`)) {
        this.deviceManager.deleteDevice(curDev.id);
      }
      return true;
    }
    if (this.cableManager?.selectedCableId) {
      const curCab = this.cableManager.getConnectionById(this.cableManager.selectedCableId);
      if (curCab && confirm(`Hapus jalur kabel "${curCab.name}"?`)) {
        this.cableManager.deleteConnection(curCab.id);
      }
      return true;
    }
    const selObj3dId = stateManager.getSelectedObject3dId?.();
    if (selObj3dId) {
      const curObj3d = stateManager.getObject3dById?.(selObj3dId);
      if (curObj3d && confirm(`Hapus objek 3D "${curObj3d.name || selObj3dId}"?`)) {
        stateManager.deleteObject3d(selObj3dId);
      }
      return true;
    }
    const selRoom3dId = stateManager.getSelectedRoom3dId?.();
    if (selRoom3dId) {
      const curRoom3d = stateManager.getRoom3dById?.(selRoom3dId);
      if (curRoom3d && confirm(`Hapus ruangan 3D "${curRoom3d.name || selRoom3dId}"?`)) {
        stateManager.deleteRoom3d?.(selRoom3dId);
      }
      return true;
    }
    const selRoad3dId = stateManager.getSelectedRoad3dId?.();
    if (selRoad3dId) {
      const curRoad3d = stateManager.getRoad3dById?.(selRoad3dId);
      if (curRoad3d && confirm(`Hapus jalan 3D "${curRoad3d.name || selRoad3dId}"?`)) {
        if (this.map3DEngine?.roadBuildState?.roadId === selRoad3dId) {
          this.map3DEngine.roadBuildState = null;
          this.map3DEngine.clearGroup?.(this.map3DEngine.roadPreviewGroup);
        }
        stateManager.deleteRoad3d?.(selRoad3dId);
      }
      return true;
    }
    return false;
  }

  /**
   * Initialize Progressive Web App (Service Worker + Install prompt handling).
   */
  setupPwaSupport() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (this._pwaInitialized) return;
    this._pwaInitialized = true;
    this._deferredPwaPrompt = null;

    const proto = window.location?.protocol || '';
    if ((proto === 'http:' || proto === 'https:') && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then((reg) => reg?.update?.())
        .catch((err) => {
          console.warn('[NetMap PWA] Service Worker registration skipped:', err?.message || err);
        });
    }

    const isInstalledPwa = () => Boolean(
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
      window.navigator?.standalone
    );

    const updatePwaUI = () => {
      const installed = isInstalledPwa();
      const canPrompt = Boolean(this._deferredPwaPrompt);
      const badge = document.getElementById('badge-menu-pwa');
      if (badge) badge.textContent = installed ? 'Terpasang' : (canPrompt ? 'Install' : 'Siap');
      const btnTop = document.getElementById('btn-install-pwa');
      if (btnTop) {
        btnTop.style.display = installed ? 'none' : '';
        btnTop.classList.toggle('is-ready', canPrompt);
      }
      const btnMob = document.getElementById('btn-mob-install-pwa');
      if (btnMob) {
        btnMob.style.display = installed ? 'none' : '';
        btnMob.classList.toggle('is-ready', canPrompt);
      }
    };

    this._updatePwaUI = updatePwaUI;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._deferredPwaPrompt = e;
      updatePwaUI();
    });

    window.addEventListener('appinstalled', () => {
      this._deferredPwaPrompt = null;
      updatePwaUI();
      this.map3DEngine?.showStatusHint?.('Aplikasi SmartSchool NetMap berhasil dipasang!');
    });

    document.getElementById('btn-install-pwa')?.addEventListener('click', () => {
      this.toolbar?.closeNavbarDropdowns?.();
      this.triggerPwaInstall();
    });

    updatePwaUI();
  }

  /**
   * Trigger native PWA install prompt when available, or display quick manual browser guide.
   */
  async triggerPwaInstall() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return { outcome: 'unsupported' };
    const showPwaToast = (text) => {
      this.map3DEngine?.showStatusHint?.(text);
      document.getElementById('netmap-pwa-toast')?.remove();
      const toast = document.createElement('div');
      toast.id = 'netmap-pwa-toast';
      toast.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9999;max-width:min(420px,calc(100vw - 24px));background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--accent-blue);border-radius:10px;padding:10px 14px;box-shadow:var(--shadow-lg);font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;';
      toast.innerHTML = `<span>${text}</span><button type="button" style="border:none;background:var(--accent-blue);color:#fff;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;">Tutup</button>`;
      toast.querySelector('button')?.addEventListener('click', () => toast.remove());
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5500);
    };

    const isInstalled = Boolean(
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
      window.navigator?.standalone
    );
    if (isInstalled) {
      showPwaToast('SmartSchool NetMap sudah terpasang sebagai aplikasi PWA.');
      return { outcome: 'already-installed' };
    }

    if (this._deferredPwaPrompt && typeof this._deferredPwaPrompt.prompt === 'function') {
      try {
        await this._deferredPwaPrompt.prompt();
        const choice = await this._deferredPwaPrompt.userChoice;
        this._deferredPwaPrompt = null;
        this._updatePwaUI?.();
        return { outcome: choice?.outcome || 'prompted' };
      } catch { /* fall through to guide */ }
    }

    showPwaToast('Install PWA: Buka menu browser (⋮ / Share) lalu pilih "Install Aplikasi" atau "Tambahkan ke Layar Utama".');
    return { outcome: 'manual-guide' };
  }

  /**
   * Minimize / restore the mobile top floating navbar dock for completely unobstructed fullscreen.
   */
  setMobileDockMinimized(minimized, { persist = true } = {}) {
    if (typeof document === 'undefined') return false;
    this._mobileDockMinimized = Boolean(minimized);
    if (persist) {
      try {
        localStorage.setItem('netmap_mob_dock_min_v1', this._mobileDockMinimized ? '1' : '0');
      } catch { /* ignore storage restrictions */ }
    }
    document.body.classList.toggle('mobile-dock-minimized', this._mobileDockMinimized);
    document.getElementById('mobile-fs-dock')?.classList.toggle('is-minimized', this._mobileDockMinimized);
    const showTab = document.getElementById('btn-mob-show-dock');
    if (showTab) {
      showTab.classList.toggle('hidden', !this._mobileDockMinimized);
      showTab.style.display = this._mobileDockMinimized ? 'inline-flex' : 'none';
    }
    return this._mobileDockMinimized;
  }

  toggleMobileDockMinimized() {
    return this.setMobileDockMinimized(!this._mobileDockMinimized);
  }

  /**
   * Configure mobile touch UX: forced landscape+fullscreen mode without confirmation dialog,
   * drawer behavior, minimizable navbar, and compact mobile quick-dock mirroring all desktop capabilities.
   */
  setupMobileExperience() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    this._landscapePromptDismissed = true;
    this._mobilePopoversInitialized = false;

    const applyMobileEnvironment = (initialBoot = false) => {
      const isMobile = isMobileTouchDevice();
      const isPortrait = window.innerHeight > window.innerWidth;
      document.body.classList.toggle('is-mobile-touch', isMobile);
      document.body.classList.toggle('is-mobile-portrait', Boolean(isMobile && isPortrait));
      document.body.classList.toggle('is-mobile-landscape', Boolean(isMobile && !isPortrait));

      const fsBtn = document.getElementById('btn-mob-fs-native');
      if (fsBtn) {
        fsBtn.classList.toggle('is-portrait-hint', Boolean(isMobile && isPortrait));
        fsBtn.title = isPortrait
          ? 'Putar ke Landscape Fullscreen (Disarankan)'
          : 'Fullscreen & Landscape';
      }

      const promptEl = document.getElementById('mobile-landscape-prompt');
      if (promptEl) {
        promptEl.classList.add('hidden');
        promptEl.style.display = 'none';
      }
      if (!isMobile) {
        document.body.classList.remove('mobile-dock-minimized', 'is-mobile-portrait', 'is-mobile-landscape');
        const showTab = document.getElementById('btn-mob-show-dock');
        if (showTab) {
          showTab.classList.add('hidden');
          showTab.style.display = 'none';
        }
        return;
      }

      if (initialBoot && !this._mobileBootApplied) {
        this._mobileBootApplied = true;
        this._mobileExitedFullscreen = false;
        this._mobileFirstGestureAttempted = false;
        // Default sidebars collapsed & force workspace fullscreen + prefer landscape without confirmation dialog
        stateManager.toggleSidebar('left', false);
        stateManager.toggleSidebar('right', false);
        document.querySelector('.sidebar-left')?.classList?.add('collapsed');
        document.querySelector('.sidebar-right')?.classList?.add('collapsed');
        document.getElementById('btn-mob-left-drawer')?.classList?.remove('active');
        document.getElementById('btn-mob-right-drawer')?.classList?.remove('active');
        this.toolbar?.setWorkspaceFullscreen?.(true, { requestNative: true, lockLandscape: true });

        let savedDockMin = false;
        try {
          savedDockMin = localStorage.getItem('netmap_mob_dock_min_v1') === '1';
        } catch { /* ignore */ }
        this.setMobileDockMinimized(savedDockMin, { persist: false });

        // Attempt native fullscreen + landscape lock automatically on the first workspace gesture
        // without blocking ongoing portrait gameplay if user keeps holding phone vertically
        const forceMobileFullscreenOnGesture = (ev) => {
          if (!document.body.classList.contains('is-mobile-touch') || this._mobileExitedFullscreen) return;
          if (this.authModal?.isOpen?.()) return;
          const activeTag = document.activeElement?.tagName || '';
          if (/^(INPUT|TEXTAREA|SELECT)$/i.test(activeTag)) return;
          const t = ev?.target;
          if (t?.closest?.('input, textarea, select, label, form, .auth-modal-backdrop, .ddm-backdrop, #room-3d-modal, #object-3d-modal, #device-3d-model-modal, #mobile-quick-popover')) {
            return;
          }
          if (this._mobileFirstGestureAttempted) return;
          this._mobileFirstGestureAttempted = true;
          if (!document.body.classList.contains('workspace-fullscreen')) {
            this.toolbar?.setWorkspaceFullscreen?.(true, { requestNative: true, lockLandscape: true });
            return;
          }
          if (!document.fullscreenElement) {
            this.toolbar?.requestNativeFullscreenAndLandscape?.();
          } else if (window.innerHeight > window.innerWidth) {
            try {
              const res = screen?.orientation?.lock?.('landscape');
              if (res && typeof res.catch === 'function') res.catch(() => { });
            } catch { /* ignore */ }
          }
        };
        document.addEventListener('pointerdown', forceMobileFullscreenOnGesture, { capture: true, passive: true });
        document.addEventListener('touchstart', forceMobileFullscreenOnGesture, { capture: true, passive: true });
        document.addEventListener('click', forceMobileFullscreenOnGesture, { capture: true, passive: true });
      } else {
        this.setMobileDockMinimized(Boolean(this._mobileDockMinimized), { persist: false });
      }
    };

    const bindMobileDock = () => {
      const dock = document.getElementById('mobile-fs-dock');
      if (!dock || this._mobileDockBound) return;
      this._mobileDockBound = true;

      const closeOverlays = () => {
        document.getElementById('mobile-quick-popover')?.remove();
      };

      document.getElementById('btn-mob-left-drawer')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOverlays();
        stateManager.toggleSidebar('right', false);
        stateManager.toggleSidebar('left');
      });

      document.getElementById('btn-mob-right-drawer')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOverlays();
        stateManager.toggleSidebar('left', false);
        stateManager.toggleSidebar('right');
      });

      document.querySelectorAll('[data-mob-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeOverlays();
          const v = btn.getAttribute('data-mob-view');
          if (v) stateManager.setViewMode(v);
        });
      });

      document.querySelectorAll('[data-mob-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          closeOverlays();
          const m = btn.getAttribute('data-mob-mode');
          if (m) stateManager.setMode(m);
        });
      });

      document.getElementById('btn-mob-undo')?.addEventListener('click', () => this.historyManager?.undo());
      document.getElementById('btn-mob-redo')?.addEventListener('click', () => this.historyManager?.redo());
      document.getElementById('btn-mob-delete')?.addEventListener('click', () => {
        if (!this.deleteCurrentSelection()) {
          this.map3DEngine?.showStatusHint?.('Pilih perangkat, kabel, objek 3D, atau ruangan terlebih dahulu.');
        }
      });
      document.getElementById('btn-mob-rotate-sel')?.addEventListener('click', () => {
        if (stateManager.getViewMode() === '3d') {
          if (!this.map3DEngine?.rotateSelectedIn3D({ dY: 15 })) {
            this.map3DEngine?.showStatusHint?.('Pilih perangkat, objek 3D, atau ruangan 3D untuk memutar.');
          }
        }
      });

      document.getElementById('btn-mob-auth')?.addEventListener('click', () => {
        closeOverlays();
        this.authModal?.show('login');
      });

      document.getElementById('btn-mob-install-pwa')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOverlays();
        this.triggerPwaInstall();
      });

      document.getElementById('btn-mob-fs-native')?.addEventListener('click', () => {
        this._mobileExitedFullscreen = false;
        this.toolbar?.setWorkspaceFullscreen?.(true, { requestNative: true, lockLandscape: true });
      });

      document.getElementById('btn-mob-toggle-toolbar')?.addEventListener('click', () => {
        closeOverlays();
        this._mobileExitedFullscreen = true;
        this.toolbar?.setWorkspaceFullscreen?.(false);
      });

      document.getElementById('btn-mob-hide-dock')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOverlays();
        this.setMobileDockMinimized(true);
      });

      document.getElementById('btn-mob-show-dock')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setMobileDockMinimized(false);
      });

      document.getElementById('btn-mob-enter-landscape-fs')?.addEventListener('click', () => {
        this._landscapePromptDismissed = true;
        const p = document.getElementById('mobile-landscape-prompt');
        if (p) {
          p.classList.add('hidden');
          p.style.display = 'none';
        }
        this.toolbar?.setWorkspaceFullscreen?.(true, { requestNative: true, lockLandscape: true });
      });

      document.getElementById('btn-mob-dismiss-landscape')?.addEventListener('click', () => {
        this._landscapePromptDismissed = true;
        const p = document.getElementById('mobile-landscape-prompt');
        if (p) {
          p.classList.add('hidden');
          p.style.display = 'none';
        }
      });

      document.getElementById('btn-mob-search')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = document.getElementById('mobile-quick-popover');
        if (existing?.getAttribute('data-kind') === 'search') {
          existing.remove();
          return;
        }
        closeOverlays();
        const pop = document.createElement('div');
        pop.id = 'mobile-quick-popover';
        pop.setAttribute('data-kind', 'search');
        pop.style.cssText = 'position:absolute;top:48px;left:50%;transform:translateX(-50%);width:min(360px,calc(100vw - 24px));background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:8px;box-shadow:var(--shadow-lg);z-index:96;display:flex;flex-direction:column;gap:6px;';
        pop.innerHTML = `
          <input type="text" id="mob-search-inp" placeholder="Cari perangkat, IP, VLAN..." autocomplete="off"
                 style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:12px;">
          <div id="mob-search-res" style="max-height:170px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;"></div>
        `;
        document.getElementById('map-viewport')?.appendChild(pop);
        const inp = pop.querySelector('#mob-search-inp');
        const resBox = pop.querySelector('#mob-search-res');
        const renderHits = (q) => {
          const hits = this.searchEngine?.searchDevices?.(q, { browseWhenEmpty: true, limit: 8 }) || [];
          resBox.innerHTML = hits.length === 0
            ? '<div style="font-size:11px;color:var(--text-muted);padding:4px;">Tidak ada hasil</div>'
            : hits.map((d) => `<button type="button" class="btn btn-secondary btn-sm mob-search-hit" data-id="${d.id}" style="justify-content:space-between;font-size:11px;padding:5px 8px;"><span>${d.name}</span><span style="opacity:0.7;font-family:var(--font-mono);">${d.network?.ip || d.type}</span></button>`).join('');
          resBox.querySelectorAll('.mob-search-hit').forEach((b) => {
            b.addEventListener('click', () => {
              const id = b.getAttribute('data-id');
              const dev = this.deviceManager?.getDeviceById(id);
              if (dev) {
                this.deviceManager.selectDevice(id);
                if (stateManager.getViewMode() === '3d') {
                  this.map3DEngine?.focusOnDevice(id);
                } else {
                  this.viewportNavigator?.focusOnDevice(dev);
                }
              }
              pop.remove();
            });
          });
        };
        inp.addEventListener('input', () => renderHits(inp.value));
        renderHits('');
        setTimeout(() => inp.focus(), 20);
      });

      document.getElementById('btn-mob-menu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = document.getElementById('mobile-quick-popover');
        if (existing?.getAttribute('data-kind') === 'menu') {
          existing.remove();
          return;
        }
        closeOverlays();
        const pop = document.createElement('div');
        pop.id = 'mobile-quick-popover';
        pop.setAttribute('data-kind', 'menu');
        pop.style.cssText = 'position:absolute;top:48px;right:10px;width:min(260px,calc(100vw - 20px));max-height:calc(100dvh - 64px);overflow-y:auto;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:6px;box-shadow:var(--shadow-lg);z-index:96;display:grid;grid-template-columns:1fr;gap:4px;';
        const actions = [
          { id: 'mob-act-3d-nav', label: 'Buka Bar Navigasi 3D', fn: () => { if (stateManager.getViewMode() !== '3d') stateManager.setViewMode('3d'); this.setMobileDockMinimized(false); this.set3DControlsMinimized?.(false); } },
          { id: 'mob-act-teknisi', label: 'Mode Teknisi (Roblox Mobile)', fn: () => { if (stateManager.getViewMode() !== '3d') stateManager.setViewMode('3d'); setTimeout(() => this.map3DEngine?.setAvatarMode(true, { perspective: 'tpp' }), 40); } },
          { id: 'mob-act-fpp', label: 'Mode FPP (Kamera Orang Pertama)', fn: () => { if (stateManager.getViewMode() !== '3d') stateManager.setViewMode('3d'); setTimeout(() => this.map3DEngine?.setAvatarMode(true, { perspective: 'fpp' }), 40); } },
          { id: 'mob-act-xray', label: this.map3DEngine?.buildingXrayMode ? 'Matikan X-Ray Gedung' : 'Aktifkan X-Ray Gedung', fn: () => { if (stateManager.getViewMode() !== '3d') stateManager.setViewMode('3d'); setTimeout(() => this.map3DEngine?.toggleBuildingXrayMode?.(), 40); } },
          { id: 'mob-act-jobsheet', label: 'Jobsheet Praktikum SMK', fn: () => this.jobsheetPanel?.show?.('catalog') },
          { id: 'mob-act-shortcuts', label: 'Panduan Kontrol (?)', fn: () => this.onboardingModal?.showShortcuts?.() },
          { id: 'mob-act-lock-rooms', label: this.map3DEngine?.roomsLocked ? 'Buka Kunci Ruangan 3D' : 'Kunci Semua Ruangan 3D', fn: () => this.map3DEngine?.toggleRoomsLocked?.() },
          { id: 'mob-act-rooms3d', label: 'Ruangan & Gedung 3D (.GLB)', fn: () => this.room3DModal?.show() },
          { id: 'mob-act-obj3d', label: 'Studio Objek 3D', fn: () => this.object3DModal?.show() },
          { id: 'mob-act-dev3d', label: 'Model 3D Perangkat', fn: () => this.device3DModelModal?.show() },
          { id: 'mob-act-topo', label: 'Diagram Topologi', fn: () => this.topologyModal?.show() },
          { id: 'mob-act-ip', label: 'Tabel IP & VLAN', fn: () => this.ipVlanModal?.show() },
          { id: 'mob-act-proj', label: 'Kelola Proyek', fn: () => this.projectModal?.show() },
          { id: 'mob-act-export', label: 'Ekspor (JSON / PNG / PDF)', fn: () => this.exportModal?.show() },
          { id: 'mob-act-scale', label: 'Kalibrasi Skala Peta', fn: () => this.mapScaleModal?.show() },
          { id: 'mob-act-fit', label: 'Pas-kan Peta ke Layar (Fit)', fn: () => { if (stateManager.getViewMode() === '3d') this.map3DEngine?.zoomExtents(); else this.mapEngine?.interactions?.fitToScreen(24); } },
          { id: 'mob-act-theme', label: 'Ganti Tema (Terang / Gelap)', fn: () => this.toolbar?.toggleTheme() },
          { id: 'mob-act-pwa', label: 'Install Aplikasi (PWA)', fn: () => this.triggerPwaInstall() },
          { id: 'mob-act-hide-nav', label: 'Sembunyikan Navbar Atas', fn: () => this.setMobileDockMinimized(true) }
        ];
        pop.innerHTML = actions.map((a) => `<button type="button" class="navbar-dropdown-item" id="${a.id}" style="font-size:11.5px;padding:7px 9px;">${a.label}</button>`).join('');
        document.getElementById('map-viewport')?.appendChild(pop);
        actions.forEach((a) => {
          pop.querySelector(`#${a.id}`)?.addEventListener('click', () => {
            pop.remove();
            a.fn();
          });
        });
      });

      document.getElementById('map-viewport')?.addEventListener('pointerdown', (ev) => {
        if (!document.body.classList.contains('is-mobile-touch')) return;
        const target = ev.target;
        if (!target.closest?.('#mobile-quick-popover') && !target.closest?.('#mobile-fs-dock')) {
          closeOverlays();
        }
        if (!target.closest?.('.sidebar') && !target.closest?.('#btn-mob-left-drawer') && !target.closest?.('#btn-mob-right-drawer')) {
          if (stateManager.getState().ui.leftSidebarOpen) stateManager.toggleSidebar('left', false);
          if (stateManager.getState().ui.rightSidebarOpen) stateManager.toggleSidebar('right', false);
        }
      });

      const syncDockButtons = () => {
        const curView = stateManager.getViewMode();
        const curMode = stateManager.getMode();
        document.querySelectorAll('[data-mob-view]').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-mob-view') === curView);
        });
        document.querySelectorAll('[data-mob-mode]').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-mob-mode') === curMode);
        });
        const rotBtn = document.getElementById('btn-mob-rotate-sel');
        if (rotBtn) rotBtn.style.display = curView === '3d' ? 'inline-flex' : 'none';
      };

      eventBus.on('viewmode:changed', syncDockButtons);
      eventBus.on('mode:changed', syncDockButtons);
      eventBus.on('ui:sidebar-toggled', ({ side, open }) => {
        if (side === 'left') document.getElementById('btn-mob-left-drawer')?.classList.toggle('active', Boolean(open));
        if (side === 'right') document.getElementById('btn-mob-right-drawer')?.classList.toggle('active', Boolean(open));
      });
      syncDockButtons();
    };

    bindMobileDock();
    applyMobileEnvironment(true);

    const onViewportChange = () => {
      applyMobileEnvironment(false);
      this.map3DEngine?.syncMobileRobloxControlsVisibility?.();
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', () => setTimeout(onViewportChange, 120));
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
          color: '#537b8e',
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
        name: 'Uplink Router -> Core Switch',
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
        name: 'Backbone FO NOC -> Gedung A',
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
        name: 'Backbone FO NOC -> Gedung B',
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
