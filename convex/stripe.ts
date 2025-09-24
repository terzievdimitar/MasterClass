import { ConvexError, v } from 'convex/values';
import { action } from './_generated/server';
import { api } from './_generated/api';
import stripe from '../src/lib/stripe';
import ratelimit from '../src/lib/ratelimit';

export const createCheckoutSession = action({
	args: { courseId: v.id('courses') },
	handler: async (ctx, args): Promise<{ checkoutUrl: string | null }> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError('Not authenticated');
		}

		const user = await ctx.runQuery(api.users.getUserByClerkId, { clerkId: identity.subject });
		if (!user) {
			throw new ConvexError('User not found');
		}

		// TODO: implement rate limiting to prevent abuse
		const rateLimitKey = `checkout_rate_limit:${user._id}`;
		const { success, reset } = await ratelimit.limit(rateLimitKey);

		if (!success) {
			throw new Error(`Rate limit exceeded.`);
		}

		const course = await ctx.runQuery(api.courses.getCourseById, { courseId: args.courseId });
		if (!course) {
			throw new ConvexError('Course not found');
		}

		const session = await stripe.checkout.sessions.create({
			customer: user.stripeCustomerId,
			payment_method_types: ['card'],
			line_items: [
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: course.title,
							description: course.description,
							images: [course.imageUrl],
						},
						unit_amount: Math.round(course.price * 100),
					},
					quantity: 1,
				},
			],
			mode: 'payment',
			success_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${args.courseId}/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses`,
			metadata: {
				courseId: args.courseId,
				userId: user._id,
			},
		});
		return { checkoutUrl: session.url };
	},
});

export const createProPlanCheckoutSession = action({
	args: { planId: v.union(v.literal('month'), v.literal('year')) },
	handler: async (ctx, args): Promise<{ checkoutUrl: string | null }> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError('Not authenticated');
		}

		const user = await ctx.runQuery(api.users.getUserByClerkId, { clerkId: identity.subject });
		if (!user) {
			throw new ConvexError('User not found');
		}

		// rate limiting to prevent abuse
		const rateLimitKey = `pro-plan-rate-limit:${user._id}`;
		const { success, reset } = await ratelimit.limit(rateLimitKey);
		if (!success) {
			throw new Error(`Rate limit exceeded. Try again in ${Math.round(reset / 1000)} seconds.`);
		}

		// month or year plan
		let priceId;
		if (args.planId === 'month') {
			priceId = process.env.STRIPE_MONTHLY_PRICE_ID;
		} else if (args.planId === 'year') {
			priceId = process.env.STRIPE_YEARLY_PRICE_ID;
		}

		if (!priceId) {
			throw new ConvexError('Invalid plan ID');
		}

		const session = await stripe.checkout.sessions.create({
			customer: user.stripeCustomerId,
			line_items: [
				{
					price: priceId,
					quantity: 1,
				},
			],
			mode: 'subscription',
			success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pro/success?session_id={CHECKOUT_SESSION_ID}&year=${args.planId === 'year'}`,
			cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pro`,
			metadata: {
				userId: user._id,
				planId: args.planId,
			},
		});
		return { checkoutUrl: session.url };
	},
});
