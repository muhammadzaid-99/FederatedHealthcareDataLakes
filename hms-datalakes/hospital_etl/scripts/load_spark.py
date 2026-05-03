import os
from pyspark.sql import SparkSession
from pyspark import SparkConf

# === CONFIGURATION ===
# This is the root directory where your timestamped Parquet output directories are stored.
# Based on your previous output, this should be:
# C:\Users\user\Documents\Programs\Python\hms\hospital_etl\parquet
PARQUET_ROOT_DIR = os.path.abspath("parquet/validated")

# === CREATE SPARK SESSION ===
spark = SparkSession.builder \
    .appName("ReadAllParquets") \
    .getOrCreate()

# IMPORTANT: Use a wildcard (*) to tell Spark to read all immediate subdirectories
# as separate Parquet datasets and combine them.
PARQUET_READ_PATH = os.path.join(PARQUET_ROOT_DIR, "*") # This will expand to e.g., '.../parquet/*'

def find_parquet_dataset_dirs(root_dir: str):
    """
    Return a list of directories (absolute paths) that directly contain part-*.parquet files.
    """
    root_dir = os.path.abspath(root_dir)
    results = []
    # Search up to 3 levels deep — adjust as needed
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # look for part files
        for f in filenames:
            if f.startswith("part-") and f.endswith(".parquet"):
                results.append(dirpath)
                break
    # unique
    return sorted(set(results))

print(f"Spark Session created. Attempting to read Parquet files from: {PARQUET_READ_PATH}")

try:
    # === READ ALL PARQUET FILES ===
    # Spark will now look into each subdirectory (like 'checkups_2025-07-28_16-24-25.parquet')
    # and combine their data, assuming compatible schemas.
    # df_all_parquets = spark.read.parquet(PARQUET_READ_PATH)

    # print("\nSuccessfully loaded Parquet data!")
    # print(f"Total records found: {df_all_parquets.count()}")

    # print("\nSchema of the combined DataFrame:")
    # df_all_parquets.printSchema()

    # print("\nFirst 20 rows of the combined DataFrame:")
    # df_all_parquets.show()

    # df_all_parquets.write.mode("overwrite").json("load_json")
    
    dataset_dirs = find_parquet_dataset_dirs(PARQUET_ROOT_DIR)
    if not dataset_dirs:
        raise RuntimeError(f"No parquet part files found under {PARQUET_ROOT_DIR}")
    # read all datasets (Spark will union them)
    df_all = spark.read.parquet(*dataset_dirs)
    df_all.show()
    df_all.write.mode("overwrite").json("load_json")

except Exception as e:
    print(f"\nAn error occurred while reading Parquet files: {e}")
    print("Please ensure the directory exists and contains valid Parquet datasets, or that their schemas are compatible.")
    print(f"Directory Spark tried to read from: {PARQUET_READ_PATH}")
    print(f"Contents of the root directory ({PARQUET_ROOT_DIR}):")
    if os.path.exists(PARQUET_ROOT_DIR):
        for item in os.listdir(PARQUET_ROOT_DIR):
            item_path = os.path.join(PARQUET_ROOT_DIR, item)
            if os.path.isdir(item_path):
                print(f"- Directory: {item}")
                # Check for part files inside these subdirectories
                part_files = [f for f in os.listdir(item_path) if f.startswith('part-') and f.endswith('.parquet')]
                if part_files:
                    print(f"  (Contains {len(part_files)} part-*.parquet files)")
                else:
                    print(f"  (Does NOT contain part-*.parquet files directly - possible empty Parquet dataset?)")
            else:
                print(f"- File: {item}")
    else:
        print(f"Error: The root directory {PARQUET_ROOT_DIR} does not exist.")


finally:
    # === STOP SPARK SESSION ===
    spark.stop()
    print("\nSpark Session stopped.")
    
