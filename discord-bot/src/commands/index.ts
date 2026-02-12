import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SharedSlashCommand,
} from "discord.js";

import * as room from "./room.js";
import * as status from "./status.js";
import * as agents from "./agents.js";
import * as context from "./context.js";
import * as search from "./search.js";
import * as recall from "./recall.js";
import * as inject from "./inject.js";
import * as inbox from "./inbox.js";
import * as knowledge from "./knowledge.js";
import * as learn from "./learn.js";
import * as msg from "./msg.js";
import * as help from "./help.js";
import * as destination from "./destination.js";
import * as course from "./course.js";
import * as network from "./network.js";
import * as claims from "./claims.js";
import * as tasks from "./tasks.js";

export interface Command {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Command[] = [
  help,
  room,
  status,
  agents,
  context,
  search,
  recall,
  inject,
  inbox,
  knowledge,
  learn,
  msg,
  destination,
  course,
  network,
  claims,
  tasks,
];

export const commandMap = new Map<string, Command>(
  commands.map((c) => [c.data.name, c]),
);
