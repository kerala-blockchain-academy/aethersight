import os
import requests
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables
load_dotenv()

# import uvicorn

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="."), name="static")

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
)

# API Configuration
ALCHEMY_API_KEY = os.getenv("ALCHEMY_API_KEY")
if not ALCHEMY_API_KEY:
    raise ValueError("ALCHEMY_API_KEY environment variable is required")

url = f"https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}"
headers = {"Content-Type": "application/json"}


class BlockRangeRequest(BaseModel):
    start_block: int
    end_block: int

def load_block_data(block_number: int) -> dict:
    filename = f"data/{block_number}.json"

    if os.path.exists(filename):
        with open(filename, "r") as file:
            return json.load(file)

    params = [hex(block_number), True]
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getBlockByNumber",
        "params": params,
        "id": 1,
    }

    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=500, detail=f"Network error: {str(exc)}") from exc

    if "error" in data:
        raise HTTPException(
            status_code=400,
            detail=f"Ethereum API error: {data['error'].get('message', 'Unknown error')}",
        )

    if data.get("result") is None:
        raise HTTPException(
            status_code=404,
            detail=f"Block {block_number} not found. Block may not exist yet or is invalid.",
        )

    os.makedirs("data", exist_ok=True)
    with open(filename, "w") as file:
        json.dump(data, file)

    return data


@app.get("/")
async def read_root():
    return FileResponse("index.html")


@app.get("/style.css")
async def get_css():
    return FileResponse("style.css")


@app.get("/script.js")
async def get_js():
    return FileResponse("script.js")


@app.get("/block/{blockNumber}", status_code=200)
async def get_block(blockNumber: int):
    try:
        data = load_block_data(blockNumber)
        links = filter_transactions(data)
        return {"status": "success", "links": links}

    except HTTPException as exc:
        raise exc
    except Exception as exc:  # pragma: no cover - unexpected path
        print(f"Unexpected error processing block {blockNumber}: {str(exc)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(exc)}")


@app.post("/blocks", status_code=200)
async def get_block_range(payload: BlockRangeRequest):
    if payload.start_block > payload.end_block:
        raise HTTPException(status_code=400, detail="start_block must be less than or equal to end_block")

    try:
        blocks = []
        for block_number in range(payload.start_block, payload.end_block + 1):
            block_data = load_block_data(block_number)
            blocks.append(block_data)

        links = filter_transactions_range(blocks)
        return {"status": "success", "links": links}

    except HTTPException as exc:
        raise exc
    except Exception as exc:  # pragma: no cover - unexpected path
        print(
            f"Unexpected error processing block range {payload.start_block}-{payload.end_block}: {str(exc)}"
        )
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(exc)}")


def filter_transactions(data):
    transactions = data.get('result', {}).get('transactions', [])
    filtered_transactions = [{tx.get('from'): tx.get('to')} for tx in transactions]
    return json.dumps(filtered_transactions)


def filter_transactions_range(blocks_data):
    aggregated_links = []
    for block in blocks_data:
        block_result = block.get('result', {})
        transactions = block_result.get('transactions', [])
        if not transactions:
            continue

        aggregated_links.extend([{tx.get('from'): tx.get('to')} for tx in transactions])

    return json.dumps(aggregated_links)


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)