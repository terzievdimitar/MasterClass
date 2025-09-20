import { access } from 'fs';
import { mutation } from './_generated/server';
import { ConvexError, v } from 'convex/values';

export const createUser = mutation({
	args: {
		email: v.string(),
		name: v.string(),
		clerkId: v.string(),
		stripeCustomerId: v.string(),
	},
	handler: async (ctx, args) => {
		const existingUser = await ctx.db
			.query('users')
			.withIndex('by_ClerkId', (q) => q.eq('clerkId', args.clerkId))
			.unique();
		if (existingUser) {
			return existingUser._id;
		}
		const userId = await ctx.db.insert('users', {
			email: args.email,
			name: args.name,
			clerkId: args.clerkId,
			stripeCustomerId: args.stripeCustomerId,
		});
		return userId;
	},
});

export const getUserByClerkId = mutation({
	args: { clerkId: v.string() },
	handler: async (ctx, { clerkId }) => {
		return await ctx.db
			.query('users')
			.withIndex('by_ClerkId', (q) => q.eq('clerkId', clerkId))
			.unique();
	},
});

export const getUserByStripeCustomerId = mutation({
	args: { stripeCustomerId: v.string() },
	handler: async (ctx, { stripeCustomerId }) => {
		return await ctx.db
			.query('users')
			.withIndex('by_stripeCustomerId', (q) => q.eq('stripeCustomerId', stripeCustomerId))
			.unique();
	},
});

export const getUserAccess = mutation({
	args: { userId: v.id('users'), courseId: v.id('courses') },
	handler: async (ctx, { userId, courseId }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError('Not authenticated');
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError('User not found');
		}

		// Check if the user has subscibtion access
		if (user.currentSubscriptionId) {
			const subscription = await ctx.db.get(user.currentSubscriptionId);
			if (subscription && subscription.status === 'active') {
				return { hasAccess: true, accessType: 'subscription' };
			}
		}

		// Check if the user has purchased the course
		const purchase = await ctx.db
			.query('purchases')
			.withIndex('by_userId_and_courseId', (q) => q.eq('userId', userId).eq('courseId', courseId))
			.unique();

		if (purchase) {
			return { hasAccess: true, accessType: 'purchase' };
		}

		return { hasAccess: false, accessType: null };
	},
});
