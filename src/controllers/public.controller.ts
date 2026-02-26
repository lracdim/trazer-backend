import { Request, Response } from "express";
import { db } from "../db/index.js";
import { trialApplications, organizations, users } from "../db/schema.js";
import { supabaseAdmin } from "../utils/supabaseAdmin.js";
import crypto from "crypto";

const generateSlug = (name: string) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
};

const generateTempPassword = () => {
    return crypto.randomBytes(6).toString('hex').toUpperCase(); // Example: A1B2C3D4E5F6
};

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

        // 1. Basic Validation
        if (!companyName || !companyEmail || !fullName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 2. Generate Unique Slug
        let slug = generateSlug(companyName);
        const existingOrg = await db.query.organizations.findFirst({
            where: (org, { eq }) => eq(org.slug, slug)
        });

        if (existingOrg) {
            slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
        }

        // 3. Generate Temporary Password
        const tempPassword = generateTempPassword();

        // 4. Create Organization
        const [newOrg] = await db.insert(organizations).values({
            name: companyName,
            slug: slug,
            status: "active",
            planId: "trial",
            subscriptionStatus: "trialing",
        }).returning();

        // 5. Create Supabase User via Admin API
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: companyEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                organization_id: newOrg.id,
                is_setup_complete: false
            }
        });

        if (authError) {
            console.error("❌ Supabase Auth Error:", authError);
            // If user already exists, we might want to handle it differently
            if (authError.message.includes("already registered")) {
                return res.status(409).json({ error: "This email is already registered." });
            }
            throw authError;
        }

        // 6. Create User record in our DB
        await db.insert(users).values({
            id: authUser.user.id,
            email: companyEmail,
            name: fullName,
            organizationId: newOrg.id,
            role: "admin",
            status: "active",
            passwordHash: "SUPABASE_AUTH" // Placeholder since we use Supabase for Auth
        });

        // 7. Save Trial Application record
        const [newApp] = await db.insert(trialApplications).values({
            companyName,
            companyEmail,
            industry: industry || "N/A",
            companySize: companySize || "N/A",
            country: country || "N/A",
            fullName,
            jobTitle: jobTitle || "N/A",
            phoneNumber,
            monthlyUsers: parseInt(monthlyUsers) || 0,
            status: "pending",
        }).returning();

        const portalUrl = `https://trazer.vercel.app/portal/${slug}`;

        console.log(`✅ Provisioned workspace for: ${companyEmail} | Slug: ${slug}`);
        console.log(`🔑 Temp Password: ${tempPassword}`);

        res.status(201).json({
            message: "Application submitted and workspace provisioned",
            applicationId: newApp.id,
            portalUrl,
            tempPassword
        });
    } catch (error: any) {
        console.error("❌ Error in trial application flow:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
