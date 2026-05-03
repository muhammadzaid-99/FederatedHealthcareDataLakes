import pandas as pd
from sqlalchemy import create_engine
from datetime import datetime

# Replace with your DB credentials
db_url = "postgresql+psycopg2://postgres:12345678@localhost:5432/hms"
engine = create_engine(db_url)

# Example table
df = pd.read_sql("SELECT * FROM checkups", engine)

filepath = f"checkups_{datetime.now().strftime('%Y%m%d_%H%M%S')}.parquet"
df.to_parquet(filepath, engine='pyarrow')
