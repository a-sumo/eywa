// RemixPanel.ts — Main orchestrator for the 3-tab AR panel

import {
  TabId,
  PANEL_WIDTH,
  PANEL_HEIGHT,
  TAB_HEIGHT,
  TAB_WIDTH,
  TAB_SPACING,
  CONTENT_OFFSET_Y,
  TEXT_SIZE_TAB,
  EXTRUSION_DEPTH,
  COLOR_TAB_ACTIVE,
  COLOR_TAB_INACTIVE,
} from "./RemixTypes"

import { MemoriesTab } from "./MemoriesTab"
import { ContextTab } from "./ContextTab"
import { AgentTab } from "./AgentTab"

// ContainerFrame is from the SIK package — we reference it by getTypeName
// The user wires it via @input in the Lens Studio inspector
@component
export class RemixPanel extends BaseScriptComponent {
  @input
  containerFrame!: SceneObject

  private activeTab: TabId = TabId.Memories

  private tabButtons: SceneObject[] = []
  private tabTextComponents: Text3D[] = []
  private contentContainers: SceneObject[] = []

  private memoriesTab!: MemoriesTab
  private contextTab!: ContextTab
  private agentTab!: AgentTab

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.init())
  }

  private init() {
    this.configureContainerFrame()
    this.createTabBar()
    this.createContentContainers()
    this.activateTab(TabId.Memories)
  }

  private configureContainerFrame() {
    // The ContainerFrame component lives on the containerFrame SceneObject.
    // We access its properties through the script component's api interface.
    // ContainerFrame sets innerSize, billboard, follow via its own @input properties.
    // Since those are configured in the Lens Studio inspector, we set them programmatically here.
    const scripts = this.containerFrame.getComponents("Component.ScriptComponent")
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i]
      if (script.api && script.api["innerSize"] !== undefined) {
        // Found the ContainerFrame script — configure it
        script.api["innerSize"] = new vec2(PANEL_WIDTH, PANEL_HEIGHT)
        // Enable billboard Y-axis always
        if (typeof script.api["setBillboarding"] === "function") {
          script.api["setBillboarding"](
            true,  // useBillboard
            false, // xOnTranslate
            false, // xAlways
            true,  // yOnTranslate
            true   // yAlways
          )
        }
        // Enable FOV follow
        if (typeof script.api["setUseFollow"] === "function") {
          script.api["setUseFollow"](true)
        }
        if (typeof script.api["setIsFollowing"] === "function") {
          script.api["setIsFollowing"](true)
        }
        // Enable content interactability for tab buttons
        if (typeof script.api["setIsContentInteractable"] === "function") {
          script.api["setIsContentInteractable"](true)
        }
        break
      }
    }
  }

  private createTabBar() {
    const tabBar = global.scene.createSceneObject("TabBar")
    tabBar.setParent(this.sceneObject)
    // Position tab bar at top of panel content area
    const topY = PANEL_HEIGHT / 2 - TAB_HEIGHT / 2
    tabBar.getTransform().setLocalPosition(new vec3(0, topY, 0.5))
    tabBar.getTransform().setLocalRotation(quat.quatIdentity())
    tabBar.getTransform().setLocalScale(vec3.one())

    const tabLabels = ["Memories", "Context", "Agent"]
    const totalWidth = tabLabels.length * TAB_WIDTH + (tabLabels.length - 1) * TAB_SPACING
    const startX = -totalWidth / 2 + TAB_WIDTH / 2

    for (let i = 0; i < tabLabels.length; i++) {
      const tabId = i as TabId
      const btn = this.createTabButton(tabBar, tabLabels[i], tabId, startX + i * (TAB_WIDTH + TAB_SPACING))
      this.tabButtons.push(btn)
    }
  }

  private createTabButton(
    parent: SceneObject,
    label: string,
    tabId: TabId,
    xPos: number
  ): SceneObject {
    const btn = global.scene.createSceneObject("TabBtn_" + label)
    btn.setParent(parent)
    btn.getTransform().setLocalPosition(new vec3(xPos, 0, 0))
    btn.getTransform().setLocalRotation(quat.quatIdentity())
    btn.getTransform().setLocalScale(vec3.one())

    // Text3D label
    const text3d = btn.createComponent("Component.Text3D") as Text3D
    text3d.text = label
    text3d.size = TEXT_SIZE_TAB
    text3d.extrusionDepth = EXTRUSION_DEPTH
    this.tabTextComponents.push(text3d)

    // Box collider for pinch/tap interaction
    const collider = btn.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(TAB_WIDTH, TAB_HEIGHT, 1)
    collider.shape = shape

    // InteractionComponent for tap detection (pinch on Spectacles)
    const interaction = btn.createComponent("Component.InteractionComponent") as InteractionComponent
    interaction.addTouchBlockingException("TouchTypeDoubleTap")
    interaction.onTap.add(() => {
      this.activateTab(tabId)
    })

    return btn
  }

  private createContentContainers() {
    const contentParent = global.scene.createSceneObject("ContentArea")
    contentParent.setParent(this.sceneObject)
    contentParent.getTransform().setLocalPosition(new vec3(0, CONTENT_OFFSET_Y, 0.5))
    contentParent.getTransform().setLocalRotation(quat.quatIdentity())
    contentParent.getTransform().setLocalScale(vec3.one())

    // Memories content
    const memoriesObj = global.scene.createSceneObject("MemoriesContent")
    memoriesObj.setParent(contentParent)
    memoriesObj.getTransform().setLocalPosition(vec3.zero())
    memoriesObj.getTransform().setLocalRotation(quat.quatIdentity())
    memoriesObj.getTransform().setLocalScale(vec3.one())
    this.memoriesTab = memoriesObj.createComponent(
      MemoriesTab.getTypeName()
    ) as MemoriesTab
    this.contentContainers.push(memoriesObj)

    // Context content
    const contextObj = global.scene.createSceneObject("ContextContent")
    contextObj.setParent(contentParent)
    contextObj.getTransform().setLocalPosition(vec3.zero())
    contextObj.getTransform().setLocalRotation(quat.quatIdentity())
    contextObj.getTransform().setLocalScale(vec3.one())
    this.contextTab = contextObj.createComponent(
      ContextTab.getTypeName()
    ) as ContextTab
    this.contentContainers.push(contextObj)

    // Agent content
    const agentObj = global.scene.createSceneObject("AgentContent")
    agentObj.setParent(contentParent)
    agentObj.getTransform().setLocalPosition(vec3.zero())
    agentObj.getTransform().setLocalRotation(quat.quatIdentity())
    agentObj.getTransform().setLocalScale(vec3.one())
    this.agentTab = agentObj.createComponent(
      AgentTab.getTypeName()
    ) as AgentTab
    this.contentContainers.push(agentObj)
  }

  activateTab(tabId: TabId) {
    this.activeTab = tabId

    // Toggle content container visibility
    for (let i = 0; i < this.contentContainers.length; i++) {
      this.contentContainers[i].enabled = i === tabId
    }

    // Update tab button text colors via Text3D (which extends MaterialMeshVisual)
    for (let i = 0; i < this.tabTextComponents.length; i++) {
      const text3d = this.tabTextComponents[i]
      if (text3d.mainMaterial) {
        const mat = text3d.mainMaterial.clone()
        text3d.mainMaterial = mat
        mat.mainPass["baseColor"] =
          i === tabId ? COLOR_TAB_ACTIVE : COLOR_TAB_INACTIVE
      }
    }
  }
}
