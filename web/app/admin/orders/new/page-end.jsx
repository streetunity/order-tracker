              padding: \"8px 16px\",
              backgroundColor: \"var(--accent)\",
              color: \"#fff\",
              border: \"none\",
              borderRadius: \"6px\",
              cursor: \"pointer\",
              fontSize: \"14px\",
              marginTop: \"8px\",
            }}
          >
            + Add Another Item
          </button>
        </div>

        {/* Submit Buttons */}
        <div style={{ display: \"flex\", gap: \"12px\", justifyContent: \"end\" }}>
          <Link
            href=\"/admin/board\"
            style={{
              padding: \"12px 24px\",
              backgroundColor: \"var(--panel)\",
              color: \"var(--text)\",
              border: \"1px solid var(--border)\",
              borderRadius: \"6px\",
              textDecoration: \"none\",
              fontSize: \"14px\",
              fontWeight: \"500\",
            }}
          >
            Cancel
          </Link>
          
          <button
            type=\"submit\"
            disabled={loading}
            style={{
              padding: \"12px 24px\",
              backgroundColor: loading ? \"#666\" : \"var(--accent)\",
              color: \"#fff\",
              border: \"none\",
              borderRadius: \"6px\",
              cursor: loading ? \"not-allowed\" : \"pointer\",
              fontSize: \"14px\",
              fontWeight: \"500\",
            }}
          >
            {loading ? \"Creating...\" : \"Create Order\"}
          </button>
        </div>
      </form>
    </main>
  );
}