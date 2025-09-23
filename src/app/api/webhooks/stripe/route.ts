import Stripe from 'stripe';
import stripe from '@/lib/stripe';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';

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

	// todo: send email receipt
}
