import browserAPI from "./browser_shim.js";

document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("api-key");
  const providerSelect = document.getElementById("provider");
  const saveBtn = document.getElementById("save-btn");
  const status = document.getElementById("status");

  // Populate fields from storage
  const stored = await browserAPI.storage.local.get(["apiKey", "provider"]);
  apiKeyInput.value = stored.apiKey ?? "";
  providerSelect.value = stored.provider ?? "groq";

  // Save handler
  saveBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value;
    const provider = providerSelect.value;

    await browserAPI.storage.local.set({ apiKey, provider });

    status.textContent = "Saved!";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  });
});
