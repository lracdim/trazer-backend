import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { users, organizations } from "../db/schema.js";
import { ApiError } from "../utils/apiError.js";
import { eq } from "drizzle-orm";

export async function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
    try {
        if (!req.user?.userId) throw ApiError.unauthorized("Authentication required");

        const user = await db.query.users.findFirst({
            where: eq(users.id, req.user.userId),
            with: { organization: true }
        });

        if (!user || !user.organization) {
            return next(); // If they don't have an org yet, let them pass (e.g. creating one)
        }

        const org = user.organization;
        const now = new Date();

        // Check if Free Trial expired
        if (org.planId === 'free' && org.trialEndsAt && org.trialEndsAt < now) {
            throw ApiError.paymentRequired("Your 7-day Free Trial has expired. Please upgrade to the Founding Promo to continue using Spade.");
        }

        // Check if Promo expired
        if (org.planId === 'promo' && org.promoEndsAt && org.promoEndsAt < now) {
            // Usually we'd rely on Stripe webhooks to Auto-Upgrade to Standard if they have a card on file,
            // but if the subscription status is past_due or canceled, we block them.
            if (org.subscriptionStatus === 'past_due' || org.subscriptionStatus === 'canceled' || org.subscriptionStatus === 'unpaid') {
                throw ApiError.paymentRequired("Your Founding Promo has ended and payment failed. Please update your billing information.");
            }
        }

        // Standard checks
        if (org.planId === 'standard') {
            if (org.subscriptionStatus === 'past_due' || org.subscriptionStatus === 'canceled' || org.subscriptionStatus === 'unpaid') {
                throw ApiError.paymentRequired("Your subscription is past due or canceled. Please update your billing information.");
            }
        }

        next();
    } catch (error) {
        next(error);
    }
}
