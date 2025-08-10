# 車予約アプリ v3.2（Firebase同期＋フォールバック）
- Firebase設定が未入力、またはhttp/`file://`で開いた場合は**自動でローカル保存モード**に切替（ボタンが効かない問題を回避）
- https + `firebaseConfig` を正しく設定すると**自動でFirestoreリアルタイム共有**に切替
- PWA/オフライン対応、モバイル最適化（リストを上、カレンダー高さ縮小）

## 使い方
1) Firebase コンソールの「Webアプリ」から `firebaseConfig` を取得
2) `app.js` 先頭の `firebaseConfig` に貼り付け（ダミー値を置換）
3) Firestore ルールは開発中は以下に：
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}
```
4) GitHub Pages で公開URLを https で開けば共有モードに。ローカル直開きやhttpの時は端末内保存。

## 家族専用にするには（本番）
- 認証：Authentication で Anonymous を有効化
- ルール：
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{householdId}/reservations/{id} {
      allow read, write: if request.auth != null && householdId == '4eviti4w5xna4iir';
    }
  }
}
```
- 必要なら `HOUSEHOLD_ID` を変更し、ルールと `app.js` の値を合わせる
