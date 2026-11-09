<div dir="rtl">

# סנכרון עוקבים של יוצרות Fami מול אינסטגרם

הכלי מושך מאינסטגרם את מספר העוקבים האמיתי של כל יוצרת, דרך ה־API הרשמי של Meta. הוא משווה את המספר למה שהיוצרת הצהירה ומסמן חשבונות חשודים. לא צריך להאמין למספר שהיוצרת מוסרת.

## מה הדוח מראה

לכל יוצרת: עוקבים בפועל, פער מההצהרה באחוזים, ממוצע לייקים ותגובות ב־12 הפוסטים האחרונים, ואחוז מעורבות. בנוסף, הדגלים הבאים:

| דגל | מתי מופיע |
|---|---|
| הצהרה מנופחת | היוצרת הצהירה על יותר מ־10% מעל מספר העוקבים האמיתי |
| מעורבות נמוכה - לבדוק עוקבים קנויים | לייקים ותגובות מתחת ל־1% מהעוקבים. עוקבים קנויים לא עושים לייק |
| קפיצה חדה בעוקבים | עלייה של יותר מ־15% מאז הבדיקה הקודמת |
| לא נמצא - חשבון אישי או שם שגוי | החשבון לא מקצועי, או ששם המשתמש שגוי |

> **למה גם מעורבות?** אפשר לקנות 50 אלף עוקבים בכמה מאות שקלים. הסנכרון מונע שקר במספר עצמו, אבל רק המעורבות מראה אם העוקבים אמיתיים. הספים (10%, 1%, 15%) הם נקודת התחלה, ומשנים אותם בראש הקובץ `creator_sync.py`. דגל הוא סיבה לבדוק, לא הוכחה.

## מגבלות של אינסטגרם

- **רק חשבון מקצועי** (Creator או Business) נגיש דרך ה־API. מעבר לחשבון מקצועי הוא חינמי ולוקח דקה בהגדרות. **כדאי להפוך את זה לתנאי להצטרפות ל־Fami Creators.**
- הכלי משתמש ב־**Business Discovery**: חשבון האינסטגרם העסקי של Fami "מסתכל" על חשבונות של אחרים. לבדיקת חשבונות שאינם שלכם, Meta דורשת **App Review** ו**אימות עסק**. לפי מדריכים שמצאתי זה לוקח בין שבועיים לחודשיים.
- **מגבלת קצב:** כ־200 קריאות בשעה. ליותר מ־200 יוצרות צריך לפצל את הרשימה.

## הקמה חד־פעמית

1. חשבון אינסטגרם **עסקי** של Fami, מחובר לדף פייסבוק.
2. אפליקציה ב־[Meta for Developers](https://developers.facebook.com/) עם Facebook Login, והרשאות `instagram_basic` ו־`pages_show_list`. אחר כך הגשה ל־App Review וביצוע אימות עסק.
3. הפקת **Long-lived token** ומציאת ה־IG User ID של חשבון Fami.
4. הגדרת משתני סביבה. **אסור לשמור את הטוקן בקובץ בריפו:**
   ```bash
   export IG_ACCESS_TOKEN="..."
   export IG_USER_ID="1784..."
   ```

## הרצה

```bash
cp creators.example.csv creators.csv     # למלא: שם, משתמש אינסטגרם, עוקבים מוצהרים
python3 creator_sync.py creators.csv report.csv --history history.csv
```

- `report.csv` נפתח באקסל או ב־Google Sheets, עם עברית תקינה.
- `history.csv` נשמר מהרצה להרצה, וממנו מזהים קפיצות. לא למחוק אותו.
- מומלץ להריץ פעם בשבוע, וגם לפני כל קמפיין בתשלום.
- קובצי ה־CSV עם נתוני היוצרות לא נכנסים ל־git (מוגדר ב־`.gitignore`).

בדיקות: `python3 -m unittest -v`

## השלב הבא: "התחברות עם אינסטגרם" באתר

כשיהיה אתר ל־Fami Creators, הדרך החזקה יותר היא שהיוצרת **מחברת את החשבון שלה** (OAuth, ‏Instagram Login, הרשאה `instagram_business_manage_insights`). כך מקבלים נתונים שאי אפשר לקבל מבחוץ:
- **Reach** וחשיפות אמיתיות לכל פוסט וסטורי
- **דמוגרפיה של הקהל:** גיל, מגדר, עיר ומדינה. אפשר לראות כמה מהעוקבים בכלל בישראל. עוקבים קנויים מגיעים בדרך כלל מחו"ל
- תוצאות קמפיין אמיתיות להציג למותגים

גם זה דורש App Review. מומלץ לבנות אותו בשלב 2 של התוכנית.

**חלופה בתשלום:** שירותים כמו HypeAuditor או Phyllo מספקים ניתוח עוקבים מזויפים דרך API. המחירים לא מפורסמים, וצריך לבקש הצעה.

## מקורות

- [Instagram Official APIs — Reference (April 2026)](https://gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42)
- [Business Discovery API: What It Actually Returns](https://fetchlayer.dev/blog/instagram-business-discovery-api-limits)
- [Phyllo — Instagram Followers API 2026](https://www.getphyllo.com/post/how-to-use-instagram-api-to-get-followers)
- [Phyllo — Instagram API Integration Guide 2026](https://www.getphyllo.com/post/instagram-api-integration-101-for-developers-of-the-creator-economy)
- [Influencer marketing fraud in 2026](https://contentgrip.com/influencer-marketing-fraud-detection)

המידע על דרישות Meta מבוסס על מדריכים של צד שלישי. צריך לאמת אותו מול התיעוד הרשמי ב־developers.facebook.com לפני ההגשה.

</div>
