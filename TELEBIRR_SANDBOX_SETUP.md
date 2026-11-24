# MEA BOKO — Telebirr UAT setup

## Safety and environment

The deployed `mea-boko-telebirr` Edge Function is hard-coded to Ethio telecom's documented UAT/test-bed gateway. It has no production endpoint switch. Do not put production credentials into these variables. Test only with the official Telebirr test host and test merchant credentials.

An authorized adult MEA BOKO business representative must obtain and configure the merchant credentials. Never paste private keys, app secrets, PINs, passwords or OTPs into chat, GitHub, the browser app, or this repository.

## Supabase Edge Function secrets

Open the Supabase Dashboard for project `MEA BOKO COFFEE`, then Edge Functions → Secrets. Add these names using the UAT values issued by Ethio telecom:

| Secret name | What it is |
| --- | --- |
| `TELEBIRR_FABRIC_APP_ID` | Test-bed X-APP-Key / fabric app ID |
| `TELEBIRR_APP_SECRET` | Test-bed fabric app secret |
| `TELEBIRR_MERCHANT_APP_ID` | Telebirr merchant appid |
| `TELEBIRR_MERCHANT_CODE` | Registered merchant code / short code |
| `TELEBIRR_PRIVATE_KEY` | MEA BOKO merchant RSA private key in PKCS#8 PEM format |
| `TELEBIRR_PUBLIC_KEY` | Ethio telecom public key used to verify signed provider responses and callbacks, SPKI PEM format |

The private key must remain on the server. The matching merchant public key must be registered with Ethio telecom as required by its onboarding instructions. The provider's public verification key is a separate value.

## Callback URL

Register and have Ethio telecom whitelist this UAT callback URL:

`https://mccgqmiatxzrcqczazpm.supabase.co/functions/v1/mea-boko-telebirr`

The callback is accepted only after the server verifies the provider signature, merchant identity, order reference, amount and ETB currency. A browser success callback alone never marks an order as paid.

## Mini App checkout flow

1. The signed-in buyer opens a confirmed ETB order inside the Telebirr test host.
2. MEA BOKO asks the Edge Function to create a UAT pre-order.
3. The Edge Function obtains a fabric token, signs the pre-order request and returns the documented receive-code string.
4. The Mini App calls `window.ma.native('startPay', ...)`.
5. The client asks the server to verify the order; the server queries Telebirr and verifies the signed response.
6. The signed notification is also verified server-side and is processed idempotently.
7. Only a server-verified successful payment creates a confirmed payment record.

The normal website continues to use its existing payment choices. The Telebirr native checkout button is shown only when the app is running inside the Telebirr Mini App host.

## Testing checklist

- [ ] Adult business representative has confirmed the merchant account is in UAT/test mode.
- [ ] All six UAT secrets are saved in Supabase Edge Function Secrets.
- [ ] Telebirr has whitelisted the callback URL.
- [ ] The Mini App is opened using the official Telebirr test host.
- [ ] A signed-in test buyer uses a confirmed ETB test order.
- [ ] Test pre-order returns a prepay ID and receive code.
- [ ] Provider notification signature is valid.
- [ ] Query-order signature, merchant order ID, amount and currency match.
- [ ] One successful test creates exactly one payment record.
- [ ] A duplicate notification does not create a duplicate record.
- [ ] Failed, pending, cancelled or mismatched payments remain unpaid.

Do not enable live payments from this UAT function. Production onboarding, production credentials, security review and Ethio telecom approval are separate work.

## Official documentation

- Developer portal: https://developer.ethiotelecom.et/user/product
- Fabric token: https://developer.ethiotelecom.et/docs/MiniApp%20Integration%20with%20Supper%20APP/ApplyFabricToken
- Mini App checkout: https://developer.ethiotelecom.et/docs/MiniApp%20Integration%20with%20Supper%20APP/%20CheckOut
- Request signatures: https://developer.ethiotelecom.et/docs/MiniApp%20Integration%20with%20Supper%20APP/RequestSignatureProcess
- Query order: https://developer.ethiotelecom.et/docs/In%20App%20SDK%20Integration/queryOrder
- Notification callback: https://developer.ethiotelecom.et/docs/H5%20C2B%20Web%20Payment%20Integration%20Quick%20Guide/Notify_Callback
