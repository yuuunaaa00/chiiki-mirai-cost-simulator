/**
 * 地域みらい留学費用シミュレーター: 入力内容の記録用スクリプト
 *
 * 使い方(詳しくは README.md の「入力内容の記録」):
 *   1. 記録用のGoogleスプレッドシートを作り、[拡張機能] > [Apps Script] を開く
 *   2. このコードを貼り付けて保存する
 *   3. [デプロイ] > [新しいデプロイ] で「ウェブアプリ」を選び、
 *      実行するユーザー: 自分 / アクセスできるユーザー: 全員 にしてデプロイする
 *   4. 表示されたウェブアプリのURLを、シミュレーターの docs/config.js の logEndpoint に設定する
 *
 * シミュレーターからは、計算ボタンが押されるたびに1行ずつ追記される。
 * 個人を特定できる情報(氏名・メールアドレスなど)は受け取らない。
 */

const SHEET_NAME = '記録';
const HEADERS = [
  '受信日時', '種類', '居住地',
  '学校1', '交通手段1', '宿泊日数1',
  '学校2', '交通手段2', '宿泊日数2',
  '学校3', '交通手段3', '宿泊日数3',
  '最寄り空港', '帰省時期', '合計金額(円)', 'セッションID', 'ページ',
];
const TYPES = ['検討時', '留学後'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (TYPES.indexOf(data.type) === -1) return reply_(false);

    const schools = Array.isArray(data.schools) ? data.schools.slice(0, 3) : [];
    const schoolCols = [];
    for (let i = 0; i < 3; i++) {
      const s = schools[i] || {};
      schoolCols.push(clean_(s.name), clean_(s.mode), clean_(s.nights));
    }

    const sheet = getSheet_();
    sheet.appendRow([
      new Date(),
      clean_(data.type),
      clean_(data.home),
      ...schoolCols,
      clean_(data.airport),
      clean_(data.returns),
      Number(data.total) || '',
      clean_(data.session),
      clean_(data.page),
    ]);
    return reply_(true);
  } catch (err) {
    return reply_(false);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 文字列を短く切り、数式として解釈されないようにする(=, +, -, @ で始まる値の先頭に ' を付ける)
function clean_(value) {
  if (value === undefined || value === null) return '';
  let s = String(value).slice(0, 100);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function reply_(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok }))
    .setMimeType(ContentService.MimeType.JSON);
}
