# Mozu Pay By Amazon using Arc.js
### version 0.1.0

Add [Pay By Amazon](https://payments.amazon.com/home) feature to your Mozu store. All using the Arc.js framework.

## Requirements

In order to work with Arc.js, you'll need to have:

 - A Developer Account at [mozu.com](http://mozu.com/login)
 - A [Sync App](https://github.com/Mozu/generator-mozu-app/blob/master/docs/sync-app.md) created for your developer login
 - A Sandbox connected to that developer account, with code actions enabled
 - NodeJS v0.12
 - The following global NPM packages installed
    - `yo`
    - `grunt-cli`
    - `generator-mozu-app`
   Install all of these at once with the following command:
   ```sh
   npm i -g yo grunt-cli generator-mozu-app
   ```

## Setup

1. First, clone this repository to a folder on your development machine:
   ```sh
   $ git clone https://github.com/Mozu/AmazonPay.git
   
   Cloning into './AmazonPay'...
   done.
   ```

2. Login to the Mozu Developer Center and create a new app. Call it "AmamzonPay". Make a note of its Application Key.

3. Now you're prepared to generate your upload configuration! Have on hand:
    - The application key for the app you just created
    - Your Developer Center login
    - The Application Key and Shared Secret for your sync app
   Got all those? OK, in your `AmazonPay` directory you cloned from Git, run this:
   ```sh
   $ yo mozu-app --config
   ```
   You will be prompted to enter all the necessary information.

4. Once that is complete, you should be able to run `npm install`:
   ```sh
   $ npm install
   ```
   to download the necessary dependencies.

5. You're ready to sync! Run `grunt`:
   ```sh
   $ grunt
   ```
   to upload the actions to Developer Center. To upload continuously as you work, by detecting when you change files, run:
   ```sh
   $ grunt watch
   ```

## Installing Arc.js Actions

Now that you've uploaded the code to your AmazonPay app, it's ready to install in your sandbox! In the top right of the app details page for your Achievements app, there is an "Install" button. Click it, and in the ensuing dialog, select your sandbox. Click "Install"!

*If the install process fails at this point, check with Mozu Support to make sure that the Arc.js framework is enabled for your sandbox.*

Now, view your sandbox! You'll find that in the "Settings" menu in the upper right, a item called "Payment & Checkout". Choose it.

You should see a new option "PayByAmazon". click on check box to enable it.

The following settings are required for PayByAmazon to work (Additonal settings can be added by modifing src/paltform.applications/embedded.platform.applications.install.js). The values for these can be obtained from [Amazon Seller Central](https://sellercentral.amazon.com/)
- SellerId
- Client Id
- Application Id
- AWS Access key
- AWS Secret
- AWS Region
- Order Processing

## Setup

Merge [Theme](https://github.com/Mozu/core-theme-preview/tree/amazonpay-checkout) changes required to enable Pay By Amazon checkout flow in storefront


## Payment code action

The following are the actions for which embedded.commerce.payments.action.performPaymentInteraction is invoked
- CreatePayment
- AuthorizePayment
- CapturePayment
- CreditPayment
- DeclinePayment
- Rollback
- VoidPayment

After the payment interaction has been processed, one of the following states can be passed back to the system
- Authorized
- Captured
- Declined
- Failed (set this state to the payment flow will be stopped)
- Voided
- Credited
- New
- RolledBack