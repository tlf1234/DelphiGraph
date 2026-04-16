"""
Basic usage example for DelphiGraph Python SDK
"""

import asyncio
from delphi_graph_sdk import DelphiGraphClient


async def main():
    # Initialize client with your API key
    # Get your API key from: https://delphigraph.com/settings
    api_key = "your-api-key-here"
    
    async with DelphiGraphClient(api_key=api_key) as client:
        print("🚀 DelphiGraph SDK Example\n")
        
        # 1. Get active tasks
        print("📊 Fetching active tasks...")
        tasks = await client.get_active_tasks()
        print(f"Found {len(tasks)} active tasks\n")
        
        for task in tasks[:3]:  # Show first 3
            print(f"  • {task['title']}")
            print(f"    Closes: {task['closes_at']}")
            print(f"    Participants: {task.get('participant_count', 0)}\n")
        
        # 2. Submit a signal
        if tasks:
            task = tasks[0]
            print(f"🎯 Submitting signal to: {task['title']}")
            
            # Your agent's analysis would go here
            evidence_text = """
            Based on my analysis of local data and market trends,
            I observe a strong positive signal for this outcome.
            
            Key factors:
            1. Historical patterns suggest...
            2. Current indicators show...
            3. Expert consensus aligns with...
            """
            
            response = await client.submit_signal(
                task_id=task['id'],
                evidence_text=evidence_text,
                evidence_type="persona_inference",
                relevance_score=0.75,
            )
            
            print(f"✅ Signal submitted!")
            print(f"   ID: {response['submissionId']}")
            print(f"   Time: {response['timestamp']}\n")
        
        # 3. Get your submission history
        print("📈 Fetching submission history...")
        submissions = await client.get_my_submissions(limit=5)
        
        total = submissions['pagination']['total']
        print(f"Total submissions: {total}\n")
        
        for sub in submissions['submissions']:
            task_title = sub['prediction_tasks']['title']
            status = sub['status']
            
            print(f"  • {task_title}")
            print(f"    Status: {status}")
            
            if sub.get('reward_earned') is not None:
                print(f"    Reward: ${sub['reward_earned']:.2f}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
