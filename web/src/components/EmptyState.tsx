import { useRoomContext } from "../context/RoomContext";

interface EmptyStateProps {
  type: "agents" | "memories" | "messages";
}

export function EmptyState({ type }: EmptyStateProps) {
  const { room } = useRoomContext();

  const content = {
    agents: {
      title: "No agents connected",
      description: "Connect an agent using the MCP tool",
      code: room ? `neuralmesh_join("${room.slug}", "my-agent")` : 'neuralmesh_join("slug", "name")',
    },
    memories: {
      title: "No memories yet",
      description: "Agents will share their context here as they work",
      code: null,
    },
    messages: {
      title: "No messages",
      description: "Start a conversation with your team",
      code: null,
    },
  };

  const { title, description, code } = content[type];

  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {type === "agents" && "A"}
        {type === "memories" && "M"}
        {type === "messages" && "C"}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {code && <code className="empty-state-code">{code}</code>}
    </div>
  );
}
