import { Request, Response } from "express";
import { db } from "../db/index.js";
import { trialApplications } from "../db/schema.js";

export const submitTrialApplication = async (req: Request, res: Response) => {
    try {
        const {
            companyName,
            companyEmail,
            industry,
            companySize,
            country,
            fullName,
            jobTitle,
            phoneNumber,
            monthlyUsers
        } = req.body;

        // Basic validation
        if (!companyName || !companyEmail || !fullName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const [newApplication] = await db.insert(trialApplications).values({
            companyName,
            companyEmail,
            industry,
            companySize,
            country,
            fullName,
            jobTitle,
            phoneNumber,
            monthlyUsers: parseInt(monthlyUsers) || 0,
            status: "pending",
        }).returning();

        console.log(`✅ New trial application received: ${companyEmail}`);

        res.status(201).json({
            message: "Application submitted successfully",
            applicationId: newApplication.id
        });
    } catch (error: any) {
        console.error("❌ Error submitting trial application:", error);

        // Handle unique constraint violation for email
        if (error.code === '23505') {
            return res.status(409).json({ error: "An application with this email already exists" });
        }

        res.status(500).json({ error: "Internal server error" });
    }
};
