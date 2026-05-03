import os
import sys
from pyspark.sql import SparkSession
from pyspark import SparkConf
from datetime import datetime

start = sys.argv[1]
end = sys.argv[2]


# === CONFIGURATIONS ===
JDBC_URL = "jdbc:postgresql://localhost:5432/hms"
DB_TABLE = "checkups"
DB_USER = "postgres"
DB_PASSWORD = "12345678"

JDBC_DRIVER_FILENAME = "postgresql-42.7.7.jar"
JDBC_DRIVER_PATH = os.path.abspath(JDBC_DRIVER_FILENAME)

UPDATED_AFTER = "2024-07-01 00:00:00"  # Placeholder date
# OUTPUT_DIR = "C:\\Users\\user\\Documents\\Programs\\Python\\hms\\hospital_etl\\parquet"
OUTPUT_DIR = os.path.abspath("parquet")
WHERE_CLAUSE = f"updated_at > timestamp '{start}' and updated_at < timestamp '{end}'"

# === CREATE SPARK SESSION ===
spark = SparkSession.builder \
    .appName("PostgresToParquetExtract") \
    .config("spark.jars", JDBC_DRIVER_PATH) \
    .getOrCreate()

print("Spark Session created with JDBC driver.")

# === LOAD DATA FROM POSTGRES ===
df = spark.read \
    .format("jdbc") \
    .option("url", JDBC_URL) \
    .option("dbtable", f"(SELECT * FROM {DB_TABLE} WHERE {WHERE_CLAUSE}) AS filtered") \
    .option("user", DB_USER) \
    .option("password", DB_PASSWORD) \
    .option("driver", "org.postgresql.Driver") \
    .load()

print("Data loaded from PostgreSQL.")

# === WRITE TO PARQUET WITH TIMESTAMP ===
timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
df.write.mode("overwrite").parquet(f"{OUTPUT_DIR}/{DB_TABLE}_{timestamp_str}")

print(f"Data written to Parquet: {OUTPUT_DIR}/{DB_TABLE}_{timestamp_str}.parquet")

spark.stop()
print("Spark Session stopped.")