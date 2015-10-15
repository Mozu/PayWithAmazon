# Mozu Pay By Amazon using Arc.js
### version 1.0.0

The [Amazon Payments](https://payments.amazon.com/home) integration uses the Arc.js framework to create custom actions to enable the use of the Pay with Amazon service on the Mozu platform. Follow the directions below to use the code in this repository to enable Amazon Payments on your Mozu site.

**Note:** The instructions in this readme only apply if you have Arc.js enabled and are integrating this application in-house. Contact your Mozu representative to enable Arc.js on your tenant. If you installed the Pay with Amazon Certified Code Action from Mozu, you do not need to build this app. You can go directly to the [theme widget](https://github.com/Mozu/PayWithAmazon-Theme) to merge Pay with Amazon with your Mozu theme.

## Requirements

In order to work with Arc.js, you'll need to have:

 - A Developer Account at [mozu.com](http://mozu.com/login)
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
   $ git clone https://github.com/Mozu/PayWithAmazon.git
   
   Cloning into './PayWithAmazon'...
   done.
   ```

2. Login to the Mozu Developer Center and create a new app. Call it "PayWithAmazon". Make a note of its Application Key.

3. Now you're prepared to generate your upload configuration! Have on hand:
    - The application key for the app you just created
    - Your Developer Center login
   Got those? OK, in your `PayWithAmazon` directory you cloned from Git, run:
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

Now that you've uploaded the code to your PayWithAmazon app, it's ready to install in your sandbox! In the top right of the app details page for your Achievements app, there is an "Install" button. Click it, and in the ensuing dialog, select your sandbox. Click "Install"!

*If the install process fails at this point, check with Mozu Support to make sure that the Arc.js framework is enabled for your sandbox.*

Now, view your sandbox! You'll find that in the "Settings" menu in the upper right, a item called "Payment & Checkout". Choose it.

You should see a new option "PayByAmazon". Check the checkbox to enable it.

The following settings are required for PayByAmazon to work (Additonal settings can be added by modifying src/paltform.applications/embedded.platform.applications.install.js). The values for these can be obtained from [Amazon Seller Central](https://sellercentral.amazon.com/)
- SellerId
- Client Id
- Application Id
- AWS Access key
- AWS Secret
- AWS Region
- Order Processing

## Theme

Merge [Theme](https://github.com/Mozu/PayWithAmazon-Theme) changes required to enable Pay By Amazon checkout flow in storefront

To enable Pay with Amazon on your storefront, you must configure your Amazon Payments account information in the Payment Settings page in Mozu Admin. Once this information has been entered, the Pay with Amazon service is available, but in order for it to appear on your storefront for your shoppers your theme must be updated.

To update your theme to support Pay with Amazon, review and apply the changes made in our sample implementation to your own theme. A comparison between the core theme and a sample implementation of a theme with Pay with Amazon enabled can be viewed [here](https://github.com/Mozu/PayWithAmazon-Theme).

For more information on working with themes, including modifying, uploading, installing, and applying the theme to your site, see the [Theme Development documentation](http://developer.mozu.com/learn/theme-development/quickstart).


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
- Failed (set this state to terminate payment flow)
- Voided
- Credited
- New
- RolledBack
