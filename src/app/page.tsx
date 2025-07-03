'use client';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
export default function Home() {
	const tasks = useQuery(api.tasks.getAllTasks);
	return (
		<>
			<h1 className='text-4xl font-bold'>All tasks from DB</h1>
			{tasks?.map((task) => (
				<div
					key={task._id}
					className='border p-4 my-2'>
					<h2 className='text-2xl'>{task.text}</h2>
					<p>Task {task.isCompleted ? 'completed' : 'not completed'}</p>
					<p className='text-gray-500'>Created at: {new Date(task._creationTime).toLocaleString()}</p>
				</div>
			))}
		</>
	);
}
