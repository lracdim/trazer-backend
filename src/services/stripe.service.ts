import Stripe from "stripe";
import { db } from "../db/index.js";
import { organizations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

// Use a placeholder if no key is found to prevent the Node server from fatally crashing on startup
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "sk_test_dummy_key_to_prevent_startup_crash";
export const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16" as any, // latest supported type fallback
});

// Configure these base prices in your Stripe Dashboard later
const STRIPE_PRICES = {
    promoBase: process.env.STRIPE_PRICE_PROMO_BASE || "", // $109/month
    extraGuard: process.env.STRIPE_PRICE_EXTRA_GUARD || "", // $3/month
    extraAdmin: process.env.STRIPE_PRICE_EXTRA_ADMIN || "", // $7/month
    extraStorage: process.env.STRIPE_PRICE_EXTRA_STORAGE || "", // $10/month
};

export async function createCheckoutSession(orgId: string, returnUrl: string) {
    // 1. Get or create Customer
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (!org) throw new Error("Organization not found");

    let customerId = org.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            name: org.name,
            metadata: { organizationId: org.id },
        });
        customerId = customer.id;
        await db.update(organizations).set({ stripeCustomerId: customerId }).where(eq(organizations.id, org.id));
    }

    // 2. We will handle plan changes via Stripe Customer Portal to make it easier to add/remove add-ons
    // Wait, the spec says "Add-ons can be added at any time via Admin Command Center".
    // Let's create a Customer Portal session for them to manage their subscription.

    // First, verify if they have a subscription. If not, they might need to subscribe to the Promo plan first.
    if (!org.stripeSubscriptionId && org.planId === 'free') {
        // Upgrade to Promo Checkout
        if (!STRIPE_PRICES.promoBase) throw new Error("Stripe pricing not configured");

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: STRIPE_PRICES.promoBase,
                    quantity: 1,
                },
            ],
            success_url: `${returnUrl}?success=true`,
            cancel_url: `${returnUrl}?canceled=true`,
            subscription_data: {
                metadata: { organizationId: org.id },
            }
        });

        return { url: session.url };
    }

    // If they already have a subscription or are just managing add-ons, send to Portal
    const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });

    return { url: portalSession.url };
}

export function calculateResourceLimits(org: any) {
    let guards = 5;
    let admins = 1;
    let storageGB = 2; // Default Free

    if (org.planId !== 'free') {
        // Promo or Standard
        guards = 10;
        storageGB = 10;
    }

    // Add purchased add-ons
    guards += org.addonGuards || 0;
    admins += org.addonAdmins || 0;
    storageGB += ((org.addonStorage || 0) * 10); // $10 per 10GB block

    return {
        maxGuards: guards,
        maxAdmins: admins,
        maxStorageGB: storageGB
    };
}
