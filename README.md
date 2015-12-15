# Mozu Pay with Amazon Application using Arc.js
### Version 1.0.0 - Merchant Workflow

The Pay with Amazon Application by Mozu uses the Arc.js framework to create custom actions that enable the use of the Amazon Payments service on the Mozu platform. This app uses the [Amazon Marketplace Web Service (MWS) API](https://developer.amazonservices.com/gp/mws/docs.html) to connect Mozu with Amazon. 

**Note:** The code in this repository is provided for reference purposes only. If you are a Mozu customer and want to enable Pay with Amazon functionality on your storefront, you can simply install the Pay with Amazon Application by Mozu from the [Mozu App Marketplace](https://www.mozu.com/marketplace/) and integrate the required [theme](https://github.com/Mozu/PayWithAmazon-Theme) changes.

## Amazon Security Requirements
This application is implemented using a merchant workflow that requires your Amazon Web Services (AWS) Access Key ID and Secret Key. Amazon requires that merchants *never* share their Secret Key, so you should only consider this implementation if you are a merchant developing a Pay with Amazon application in-house. If you are a third-party application developer working on behalf of a client, use the hosted workflow as demonstrated in the [master branch](https://github.com/Mozu/PayWithAmazon) of this repository.

## Requirements

In order to work with Arc.js, you'll need to have:

 - A Developer Account at [mozu.com](http://mozu.com/login)
 - Arc.js enabled on your Mozu tenant. (Contact your sales or professional services representative for more information.)
 - NodeJS
 - The following global NPM packages installed:
    - `yo`
    - `grunt-cli`
    - `generator-mozu-app`

You can install all of the required NPM packages at once by running the following command in your Terminal (OS X) or Command Prompt (Windows):
   ```sh
   npm i -g yo grunt-cli generator-mozu-app
   ```

## Clone and Upload the App

1. First, clone this repository to a folder on your development machine:
   ```sh
   $ git clone https://github.com/Mozu/PayWithAmazon.git
   
   Cloning into './PayWithAmazon'...
   done.
   ```

2. Log in to the Mozu Developer Center and create a new app. Call it "PayWithAmazon". Make a note of its Application Key.

3. Now you're prepared to generate your upload configuration! Have on hand:
    - The application key for the app you just created
    - Your Developer Center login
   In the `PayWithAmazon` directory you cloned from Git, run:
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
   to upload your app to Developer Center. Or, if you want grunt to detect when you change files and upload continuously as you work, run:
   ```sh
   $ grunt watch
   ```

## Install the App

Now that you've uploaded the code to your PayWithAmazon app, it's ready to install in your sandbox! 

1.	In Mozu Dev Center, go to **Develop** > **Applications** and double-click the app. 
2.	On the app details page, click **Install**. 
3.	Select your sandbox in the dialog that appears and click **OK**.

*If the install process fails at this point, check with Mozu Support to make sure that the Arc.js framework is enabled for your sandbox.*

## Configure Your Pay with Amazon Settings in Mozu Admin

In the sandbox where you installed the app, go to **Settings** > **Payment & Checkout**.

You should see a new option for **PayWithAmazon**. Enable the checkbox to view the Amazon configuration settings. Pay with Amazon requires the following default settings for the app to work:

- SellerId
- Client Id
- Application Id
- AWS Access key
- AWS Secret
- AWS Region
- Order Processing

These settings are defined in the following file in your application:
`assets/src/domains/platform.applications/embedded.platform.applications.install.js`

You can modify this file to add additional settings.

## Merge Theme Changes
Installing and configuring the Pay with Amazon app enables you to accept payments via Amazon Payments. However, you still must enable Pay with Amazon functionality on your storefront so that customers can use it. Go to the [PayWithAmazon-Theme](https://github.com/Mozu/PayWithAmazon-Theme) repository and follow the instructions in the readme to merge Pay with Amazon functionality with your Mozu theme.

## Payment Code Actions

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
