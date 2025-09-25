import Stripe from 'stripe';
import stripe from '@/lib/stripe';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import resend from '@/lib/resend';
import PurchaseConfirmationEmail from '@/emails/PurchaseConformationEmail';
import ProPlanActivatedEmail from '@/emails/ProPlanActivatedEmail';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
	const body = await req.text();
	const signature = req.headers.get('stripe-signature') as string;

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
	} catch (error: any) {
		console.log('Webhook signature verification failed.', error);
		return new Response('Webhook signature verification failed.', { status: 400 });
	}

	try {
		switch (event.type) {
			case 'checkout.session.completed':
				await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
				break;
			case 'customer.subscription.created':
			case 'customer.subscription.updated':
				await handleSubscriptionUpsert(event.data.object as Stripe.Subscription, event.type);
				break;
			case 'customer.subscription.deleted':
				await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.type);
				break;
			default:
				console.log(`Unhandled event type: ${event.type}`);
		}
	} catch (error: any) {
		console.log('Error handling webhook event.', error);
		return new Response('Error handling webhook event.', { status: 500 });
	}

	return new Response(null, { status: 200 });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
	const courseId = session.metadata?.courseId;
	const stripeCustomerId = session.customer as string;

	if (!courseId || !stripeCustomerId) {
		console.log('Missing courseId or stripeCustomerId in session metadata.');
		return new Response('Missing courseId or stripeCustomerId in session metadata.', { status: 400 });
	}

	const user = await convex.query(api.users.getUserByStripeCustomerId, { stripeCustomerId });

	if (!user) {
		console.log('User not found for the given Stripe customer ID.');
		return new Response('User not found for the given Stripe customer ID.', { status: 404 });
	}

	await convex.mutation(api.purchases.recordPurchase, {
		userId: user._id,
		courseId: courseId as Id<'courses'>,
		amount: session.amount_total as number,
		stripePurchaseId: session.id,
	});

	// Send purchase confirmation email
	if (session.metadata && session.metadata.courseTitle && session.metadata.courseImage) {
		await resend.emails.send({
			from: 'MasterClass <onboarding@masterclass.dimitarterziev.com>',
			to: user.email,
			subject: 'Purchase Confirmation - Access Your Course Now',
			react: PurchaseConfirmationEmail({
				customerName: user.name,
				courseTitle: session.metadata?.courseTitle,
				courseImage: session.metadata?.courseImage,
				purchaseAmount: (session.amount_total || 0) / 100,
				courseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${courseId}`,
			}),
		});
	}
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription, eventType: string) {
	if (subscription.status !== 'active' || !subscription.latest_invoice) {
		console.log(`Skipping subscription ${subscription.id} - Status: ${subscription.status}`);
		return;
	}

	const stripeCustomerId = subscription.customer as string;
	const user = await convex.query(api.users.getUserByStripeCustomerId, { stripeCustomerId });

	if (!user) {
		console.log('User not found for the given Stripe customer ID.');
		return new Response(`User not found for the given Stripe customer ID. ${stripeCustomerId}`, { status: 404 });
	}

	try {
		await convex.mutation(api.subscriptions.upsertSubscription, {
			userId: user._id,
			stripeSubscriptionId: subscription.id,
			status: subscription.status,
			planType: subscription.items.data[0].plan.interval as 'month' | 'year',
			currentPeriodStart: subscription.current_period_start, // this is correct
			currentPeriodEnd: subscription.current_period_end, // this is correct
			cancelAtPeriodEnd: subscription.cancel_at_period_end,
		});
		console.log(`Subscription ${eventType} handled successfully.`);

		// todo: send email success
		const isCreation = eventType === 'customer.subscription.created';
		if (isCreation) {
			await resend.emails.send({
				from: 'MasterClass <onboarding@masterclass.dimitarterziev.com>',
				to: user.email,
				subject: 'Subscription Active - Enjoy Your Pro Plan Benefits',
				react: ProPlanActivatedEmail({
					name: user.name,
					planType: subscription.items.data[0].plan.interval,
					currentPeriodStart: subscription.current_period_start,
					currentPeriodEnd: subscription.current_period_end,
					url: process.env.NEXT_PUBLIC_APP_URL!,
				}),
			});
		}
	} catch (error) {
		console.log('Error upserting subscription.', error);
		return new Response('Error upserting subscription.', { status: 500 });
	}
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventType: string) {
	try {
		await convex.mutation(api.subscriptions.removeSubscription, {
			stripeSubscriptionId: subscription.id,
		});
		console.log(`Subscription ${eventType} handled successfully.`);
	} catch (error) {
		console.log('Error deleting subscription.', error);
		return new Response('Error deleting subscription.', { status: 500 });
	}
}
