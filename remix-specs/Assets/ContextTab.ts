// ContextTab.ts — Tab 2: Context drop zone for pinned memories

import { TabContent } from "./TabContent"
import {
  MemoryItem,
  ContextItem,
  roleColor,
  TEXT_SIZE_BODY,
  EXTRUSION_DEPTH,
} from "./RemixTypes"

@component
export class ContextTab extends TabContent {
  private contextItems: ContextItem[] = []
  private placeholderObj: SceneObject | null = null

  protected initContent() {
    super.initContent()
    this.showPlaceholder()
  }

  private showPlaceholder() {
    this.placeholderObj = global.scene.createSceneObject("Placeholder")
    this.placeholderObj.setParent(this.contentRoot)
    this.placeholderObj.getTransform().setLocalPosition(new vec3(0, -4, 0))

    const text3d = this.placeholderObj.createComponent(
      "Component.Text3D"
    ) as Text3D
    text3d.text = "Pinch + drag memories here"
    text3d.size = TEXT_SIZE_BODY
    text3d.extrusionDepth = EXTRUSION_DEPTH

    // Defer coloring — Text3D material not ready on creation frame
    this.deferOnce(() => {
      this.colorText3D(text3d, new vec4(0.5, 0.5, 0.5, 0.6))
    })
  }

  private hidePlaceholder() {
    if (this.placeholderObj && !isNull(this.placeholderObj)) {
      this.placeholderObj.destroy()
      this.placeholderObj = null
    }
  }

  addContextItem(memory: MemoryItem) {
    // Hide placeholder on first item
    if (this.contextItems.length === 0) {
      this.hidePlaceholder()
    }

    const ctxItem: ContextItem = {
      id: "ctx_" + this.contextItems.length,
      sourceMemory: memory,
      addedAt: Date.now(),
    }
    this.contextItems.push(ctxItem)

    const color = roleColor(memory.role)
    const preview =
      memory.content.length > 40
        ? memory.content.substring(0, 40) + "..."
        : memory.content
    const meta = memory.agent

    this.createItem(this.contextItems.length - 1, preview, color, meta)
  }
}
