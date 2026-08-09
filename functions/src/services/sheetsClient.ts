import { google } from "googleapis";

export interface ArchiveTab {
  name: string;
  rows: string[][];
}

/**
 * Google Sheets API 클라이언트. `googleapis`를 임포트하는 또 다른 경계 모듈(research.md
 * §16) — `archiveQuiz`(User Story 6)만 이 모듈을 임포트한다.
 */
export async function createArchiveSpreadsheet(
  title: string,
  tabs: ArchiveTab[],
): Promise<{ spreadsheetId: string; url: string }> {
  const auth = await google.auth.getClient({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth: auth as never });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: tabs.map((tab) => ({ properties: { title: tab.name } })),
    },
  });
  const spreadsheetId = created.data.spreadsheetId!;

  for (const tab of tabs) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab.name}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: tab.rows },
    });
  }

  return { spreadsheetId, url: created.data.spreadsheetUrl! };
}
