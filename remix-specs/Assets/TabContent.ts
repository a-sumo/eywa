// TabContent.ts — Base vertical list manager for tab content

import {
  ITEM_HEIGHT,
  ITEM_SPACING,
  TEXT_SIZE_BODY,
  TEXT_SIZE_META,
  EXTRUSION_DEPTH,
} from "./RemixTypes"

@component
export class TabContent extends BaseScriptComponent {
  protected items: SceneObject[] = []
  protected contentRoot!: SceneObject

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.initContent())
  }

  protected initContent() {
    this.contentRoot = global.scene.createSceneObject("ContentRoot")
    this.contentRoot.setParent(this.sceneObject)
    this.contentRoot.getTransform().setLocalPosition(vec3.zero())
    this.contentRoot.getTransform().setLocalRotation(quat.quatIdentity())
    this.contentRoot.getTransform().setLocalScale(vec3.one())
  }

  /**
   * Queue a one-shot callback using DelayedCallbackEvent (fires next frame).
   * Used to color Text3D after its material is initialized.
   */
  protected deferOnce(fn: () => void) {
    const evt = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    evt.bind(() => {
      fn()
      this.removeEvent(evt)
    })
    evt.reset(0) // fire on next frame
  }

  protected createItem(
    index: number,
    text: string,
    dotColor: vec4,
    meta: string
  ): SceneObject {
    const row = global.scene.createSceneObject("Item_" + index)
    row.setParent(this.contentRoot)

    const yPos = -(index * (ITEM_HEIGHT + ITEM_SPACING))
    row.getTransform().setLocalPosition(new vec3(0, yPos, 0))
    row.getTransform().setLocalRotation(quat.quatIdentity())
    row.getTransform().setLocalScale(vec3.one())

    // Colored dot — use a bullet character in Text3D
    const dotObj = global.scene.createSceneObject("Dot_" + index)
    dotObj.setParent(row)
    dotObj.getTransform().setLocalPosition(new vec3(-14.5, 0, 0))

    const dotText = dotObj.createComponent("Component.Text3D") as Text3D
    dotText.text = "\u25CF" // filled circle ●
    dotText.size = TEXT_SIZE_BODY * 0.8
    dotText.extrusionDepth = EXTRUSION_DEPTH

    // Color the dot after one frame (material not ready on creation frame)
    this.deferOnce(() => {
      this.colorText3D(dotText, dotColor)
    })

    // Content text
    const textObj = global.scene.createSceneObject("Text_" + index)
    textObj.setParent(row)
    textObj.getTransform().setLocalPosition(new vec3(-13, 0, 0))

    const text3d = textObj.createComponent("Component.Text3D") as Text3D
    text3d.text = text.length > 45 ? text.substring(0, 45) + "..." : text
    text3d.size = TEXT_SIZE_BODY
    text3d.extrusionDepth = EXTRUSION_DEPTH
    text3d.horizontalOverflow = HorizontalOverflow.Truncate

    // Metadata text (right side)
    const metaObj = global.scene.createSceneObject("Meta_" + index)
    metaObj.setParent(row)
    metaObj.getTransform().setLocalPosition(new vec3(11, 0, 0))

    const metaText = metaObj.createComponent("Component.Text3D") as Text3D
    metaText.text = meta
    metaText.size = TEXT_SIZE_META
    metaText.extrusionDepth = EXTRUSION_DEPTH

    this.items.push(row)
    return row
  }

  /**
   * Apply a color to a Text3D component by cloning its material.
   * Text3D extends MaterialMeshVisual, so mainMaterial is accessible directly.
   */
  protected colorText3D(text3d: Text3D, color: vec4) {
    if (text3d.mainMaterial) {
      const mat = text3d.mainMaterial.clone()
      text3d.mainMaterial = mat
      mat.mainPass["baseColor"] = color
    }
  }

  clearItems() {
    for (let i = 0; i < this.items.length; i++) {
      if (!isNull(this.items[i])) {
        this.items[i].destroy()
      }
    }
    this.items = []
  }

  layoutItems() {
    for (let i = 0; i < this.items.length; i++) {
      if (!isNull(this.items[i])) {
        const yPos = -(i * (ITEM_HEIGHT + ITEM_SPACING))
        this.items[i].getTransform().setLocalPosition(new vec3(0, yPos, 0))
      }
    }
  }
}
