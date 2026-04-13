  useEffect(() => {
    if (!params.token) return;
    async function loadFiles() {
      try {
        const res = await fetch(`/api/public/track/${params.token}/customer-documents`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setCustomerFiles(data);
        } else {
          setCustomerFiles({});
        }
      } catch {
        setCustomerFiles({});
      }
    }
    loadFiles();
  }, [params.token]);