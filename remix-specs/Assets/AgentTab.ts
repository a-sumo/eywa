// AgentTab.ts — Tab 3: Agent status cards

import { TabContent } from "./TabContent"
import { MOCK_AGENTS } from "./MockData"
import { COLOR_ACTIVE, COLOR_IDLE, timeAgo } from "./RemixTypes"

@component
export class AgentTab extends TabContent {
  protected initContent() {
    super.initContent()
    this.populateAgents()
  }

  private populateAgents() {
    for (let i = 0; i < MOCK_AGENTS.length; i++) {
      const agent = MOCK_AGENTS[i]
      const dotColor =
        agent.status === "active" ? COLOR_ACTIVE : COLOR_IDLE

      const statusLabel = agent.status.toUpperCase()
      const line1 = agent.name + " \u2014 " + statusLabel

      const line2 =
        agent.sessionCount +
        " sessions \u00B7 " +
        agent.memoryCount +
        " memories \u00B7 " +
        timeAgo(agent.lastActiveAt)

      this.createItem(i, line1, dotColor, line2)
    }
  }
}
