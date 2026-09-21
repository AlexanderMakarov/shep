export interface LoadSettingsResult {
  settings?: unknown;
  /** Credential presence summary — values are never sent to the browser. */
  secrets?: unknown;
  shepHome?: string;
  dbFileSize?: string;
  error?: string;
}

const ABSENT = { hasValue: false, lastFour: '' };

export async function loadSettings(): Promise<LoadSettingsResult> {
  return {
    settings: {},
    secrets: {
      agentToken: ABSENT,
      whatsappCloudApiAccessToken: ABSENT,
      whatsappCloudApiVerifyToken: ABSENT,
      whatsappCloudApiAppSecret: ABSENT,
      telegramBotToken: ABSENT,
      telegramRouteToken: ABSENT,
      messagingWhatsappBotToken: ABSENT,
      messagingWhatsappRouteToken: ABSENT,
    },
    shepHome: '/mock/.shep',
    dbFileSize: '0 B',
  };
}
