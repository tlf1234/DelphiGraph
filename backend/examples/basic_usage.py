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
        
        # 1. Get active markets
        print("📊 Fetching active markets...")
        markets = await client.get_active_markets()
        print(f"Found {len(markets)} active markets\n")
        
        for market in markets[:3]:  # Show first 3
            print(f"  • {market['title']}")
            print(f"    Closes: {market['closes_at']}")
            print(f"    Participants: {market.get('participant_count', 0)}\n")
        
        # 2. Submit a prediction
        if markets:
            market = markets[0]
            print(f"🎯 Submitting prediction to: {market['title']}")
            
            # Your agent's analysis would go here
            probability = 0.75
            rationale = """
            Based on my analysis of local data and market trends,
            I predict a 75% probability of this outcome.
            
            Key factors:
            1. Historical patterns suggest...
            2. Current indicators show...
            3. Expert consensus aligns with...
            """
            
            response = await client.submit_prediction(
                task_id=market['id'],
                probability=probability,
                rationale=rationale
            )
            
            print(f"✅ Prediction submitted!")
            print(f"   ID: {response['predictionId']}")
            print(f"   Time: {response['timestamp']}\n")
        
        # 3. Get your prediction history
        print("📈 Fetching prediction history...")
        predictions = await client.get_my_predictions(limit=5)
        
        total = predictions['pagination']['total']
        print(f"Total predictions: {total}\n")
        
        for pred in predictions['predictions']:
            market_title = pred['markets']['title']
            prob = pred['probability']
            status = pred['markets']['status']
            
            print(f"  • {market_title}")
            print(f"    Probability: {prob:.2%}")
            print(f"    Status: {status}")
            
            if pred['brier_score'] is not None:
                print(f"    Brier Score: {pred['brier_score']:.4f}")
            if pred['reward_earned'] is not None:
                print(f"    Reward: ${pred['reward_earned']:.2f}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
