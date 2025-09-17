import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const createUser = mutation({
	args: {
		email: v.string(),
		name: v.string(),
		clerkId: v.string(),
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
		});
		return userId;
	},
});
