'use client';
import { useUser } from '@clerk/nextjs';
import { Id } from '../../convex/_generated/dataModel';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button } from './ui/button';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';

const PurchaseButton = ({ courseId }: { courseId: Id<'courses'> }) => {
	const { user } = useUser();
	const userData = useQuery(api.users.getUserByClerkId, user ? { clerkId: user?.id } : 'skip');
	const [isLoading, setIsLoading] = useState(false);
	const createCheckoutSession = useAction(api.stripe.createCheckoutSession);

	const userAccess = useQuery(
		api.users.getUserAccess,
		userData
			? {
					userId: userData?._id,
					courseId,
				}
			: 'skip'
	) || { hasAccess: false };

	const handlePurchase = async () => {
		if (!user) {
			alert('Please sign in to purchase the course.');
			return;
		}
		setIsLoading(true);

		try {
			const { checkoutUrl } = await createCheckoutSession({ courseId });
			if (checkoutUrl) {
				window.location.href = checkoutUrl;
			} else {
				throw new Error('Failed to create checkout session');
			}
		} catch (error: any) {
			// TODO:
			console.log(error);
		} finally {
			setIsLoading(false);
		}
	};

	if (!userAccess.hasAccess) {
		return (
			<Button
				variant={'outline'}
				onClick={handlePurchase}
				disabled={isLoading}>
				Enroll Now
			</Button>
		);
	}

	if (userAccess.hasAccess) {
		return <Button variant={'outline'}>Enrolled</Button>;
	}

	if (isLoading) {
		return (
			<Button variant={'outline'}>
				<Loader2Icon className='mr-2 size-4 animate-spin' />
				Processing...
			</Button>
		);
	}

	return <div>Purchase</div>;
};

export default PurchaseButton;
