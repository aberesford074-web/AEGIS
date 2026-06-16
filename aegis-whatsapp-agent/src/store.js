import fs from "node:fs/promises";
import path from "node:path";

const initialState = {
  googleTokens: null,
  emailActions: {},
  processedMessageIds: [],
  whatsappSession: {
    activeActionId: null,
    editModeActionId: null,
    pendingSendActionId: null,
  },
  digestRuns: [],
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async read() {
    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      return { ...initialState, ...JSON.parse(contents) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.write(initialState);
      return { ...initialState };
    }
  }

  async write(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async update(mutator) {
    const data = await this.read();
    const next = await mutator(data);
    await this.write(next || data);
    return next || data;
  }

  async saveGoogleTokens(tokens) {
    return this.update((data) => {
      data.googleTokens = tokens;
      return data;
    });
  }

  async getGoogleTokens() {
    const data = await this.read();
    return data.googleTokens;
  }

  async hasProcessedMessage(messageId) {
    const data = await this.read();
    return data.processedMessageIds.includes(messageId);
  }

  async markProcessedMessage(messageId) {
    return this.update((data) => {
      data.processedMessageIds = Array.from(new Set([messageId, ...data.processedMessageIds])).slice(0, 500);
      return data;
    });
  }

  async saveEmailAction(action) {
    return this.update((data) => {
      data.emailActions[action.shortId] = {
        ...action,
        updatedAt: new Date().toISOString(),
      };
      return data;
    });
  }

  async getEmailAction(shortId) {
    const data = await this.read();
    return data.emailActions[String(shortId)];
  }

  async getWhatsAppSession() {
    const data = await this.read();
    return { ...initialState.whatsappSession, ...(data.whatsappSession || {}) };
  }

  async saveWhatsAppSession(session) {
    return this.update((data) => {
      data.whatsappSession = {
        ...initialState.whatsappSession,
        ...(data.whatsappSession || {}),
        ...session,
      };
      return data;
    });
  }

  async saveDigestRun(run) {
    return this.update((data) => {
      data.digestRuns = [run, ...(data.digestRuns || [])].slice(0, 100);
      return data;
    });
  }
}
