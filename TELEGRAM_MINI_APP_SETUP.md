# MEA BOKO Telegram Mini App setup

The React/Vite marketplace is prepared to run inside Telegram's in-app browser.

## Published web app URL

https://meaboko92.github.io/COFDEE-MARKET-ETHIOPIA-/

## Configure the bot menu button

1. Open Telegram and start a chat with **@BotFather** using the account that owns @Miebokocoffeemarketbot.
2. Send `/setmenubutton`.
3. Select **@Miebokocoffeemarketbot**.
4. Choose the option to configure the menu button.
5. Set the button text to **Open MEA BOKO**.
6. Set the Web App URL to the published URL above.
7. Save, then open your bot and tap its menu button.

If BotFather offers a Web App or Main App configuration, use the menu-button Web App option for this first launch.

## Important security note

Telegram's `initData` must be validated on a trusted server before using Telegram user identity for sign-in, permissions, or account linking. The current frontend integration only initializes the Telegram Mini App interface; it does not treat browser-provided Telegram user details as verified identity. Never put a Telegram bot token or Supabase service-role key in frontend code or a public repository.

## What is and is not complete

- The website loads Telegram's official Web App SDK.
- When opened inside Telegram, it calls `ready()` and `expand()` and applies supported Telegram header/background colors.
- The BotFather menu button still needs to be configured by the bot owner.
- A secure Telegram-to-Supabase identity bridge and bot message automation are separate follow-up tasks.
