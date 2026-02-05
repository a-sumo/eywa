// MemoriesTab.ts — Tab 1: Browse memories list

import { TabContent } from "./TabContent"
import { MOCK_MEMORIES } from "./MockData"
import { roleColor, timeAgo } from "./RemixTypes"

@component
export class MemoriesTab extends TabContent {
  protected initContent() {
    super.initContent()
    this.populateMemories()
  }

  private populateMemories() {
    for (let i = 0; i < MOCK_MEMORIES.length; i++) {
      const mem = MOCK_MEMORIES[i]
      const color = roleColor(mem.role)
      const preview =
        mem.content.length > 40
          ? mem.content.substring(0, 40) + "..."
          : mem.content
      const meta = timeAgo(mem.timestamp)

      this.createItem(i, preview, color, meta)
    }
  }
}
