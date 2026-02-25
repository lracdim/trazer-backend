import { Request, Response } from "express";
import { stripe } from "../services/stripe.service.js";
import { db } from "../db/index.js";
import { organizations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

// This MUST use the raw body, which is handled in index.ts
export async function handleStripeWebhook(req: Request, res: Response) {
    const rawBody = req.body; // Buffer populated by express.raw() in index.ts
    const signature = req.headers["stripe-signature"] as string;

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET || ""
        );
    } catch (err: any) {
        console.error(`⚠️  Webhook signature verification failed.`, err.message);
        return res.sendStatus(400);
    }

    try {
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const subscription = event.data.object as any;
                const customerId = subscription.customer as string;

                // Find organization by Stripe Customer ID
                const org = await db.query.organizations.findFirst({
                    where: eq(organizations.stripeCustomerId, customerId)
                });

                if (!org) {
                    console.error(`Organization not found for customer ${customerId}`);
                    break;
                }

                // Determine if promo or standard based on price ID
                // For this logic, we assume standard base if not free
                // Add-on quantities are parsed from subscription items
                let addonGuards = 0;
                let addonAdmins = 0;
                let addonStorage = 0;
                let isPromo = false;

                for (const item of subscription.items.data) {
                    const priceId = item.price.id;
                    if (priceId === process.env.STRIPE_PRICE_PROMO_BASE) isPromo = true;
                    if (priceId === process.env.STRIPE_PRICE_EXTRA_GUARD) addonGuards = item.quantity;
                    if (priceId === process.env.STRIPE_PRICE_EXTRA_ADMIN) addonAdmins = item.quantity;
                    if (priceId === process.env.STRIPE_PRICE_EXTRA_STORAGE) addonStorage = item.quantity;
                }

                const planId = isPromo ? 'promo' : 'standard';

                await db.update(organizations).set({
                    stripeSubscriptionId: subscription.id,
                    subscriptionStatus: subscription.status,
                    planId: planId,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    addonGuards,
                    addonAdmins,
                    addonStorage
                }).where(eq(organizations.id, org.id));

                console.log(`Updated organization ${org.id} subscription status: ${subscription.status}`);
                break;
            }
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (err) {
        console.error("Error processing webhook:", err);
        return res.sendStatus(500);
    }

    res.send();
}
