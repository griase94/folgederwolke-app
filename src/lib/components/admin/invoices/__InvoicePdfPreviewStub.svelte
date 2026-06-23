<!--
  Test stub for InvoicePdfPreview — records the `input` prop into a module
  singleton so a test can assert the parsed nettoCents without rendering the
  real PDF iframe / debounced fetch. Used only by InvoiceForm.parse.test.ts.
-->
<script lang="ts" module>
  export const capturedPreviewInput: { value: unknown } = { value: null };
</script>

<script lang="ts">
  let { input }: { input: unknown } = $props();
  $effect(() => {
    capturedPreviewInput.value = input;
  });
</script>

<div data-testid="invoice-pdf-preview-stub"></div>
