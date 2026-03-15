/** Hook for loading and saving filter rules via JMAP SieveScript */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { jmapRequest } from "@/api/mail.ts";
import { parseSieveScript, generateSieveScript } from "@/lib/sieve.ts";
import type { FilterRule } from "@/types/filter-rules.ts";
import type { JMAPRequest } from "@/types/jmap.ts";
import { toast } from "sonner";

const SIEVE_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:sieve",
];

const SCRIPT_NAME = "webmail-filters";

interface SieveScript {
  id: string;
  name: string;
  blobId: string;
  isActive: boolean;
}

/** Fetch the webmail-filters Sieve script and parse it into rules */
async function fetchFilterRules(): Promise<{
  rules: FilterRule[];
  scriptId: string | null;
}> {
  // Query for existing sieve scripts
  const queryRequest: JMAPRequest = {
    using: SIEVE_USING,
    methodCalls: [
      [
        "SieveScript/query",
        {
          filter: { name: SCRIPT_NAME },
        },
        "q0",
      ],
      [
        "SieveScript/get",
        {
          "#ids": {
            resultOf: "q0",
            name: "SieveScript/query",
            path: "/ids",
          },
        },
        "g0",
      ],
    ],
  };

  const response = await jmapRequest(queryRequest);

  // Check if we got results
  const [queryMethod] = response.methodResponses[0];
  if (queryMethod === "error") {
    // Sieve not supported — return empty
    return { rules: [], scriptId: null };
  }

  const [, queryResult] = response.methodResponses[0];
  const ids = (queryResult as { ids: string[] }).ids;

  if (!ids || ids.length === 0) {
    return { rules: [], scriptId: null };
  }

  const [, getResult] = response.methodResponses[1];
  const scripts = (getResult as { list: SieveScript[] }).list;

  if (!scripts || scripts.length === 0) {
    return { rules: [], scriptId: null };
  }

  const script = scripts[0];

  // Fetch the actual script content using the blob
  const blobResponse = await fetch(`/api/jmap/blob/${script.blobId}`, {
    credentials: "same-origin",
  });

  if (!blobResponse.ok) {
    return { rules: [], scriptId: script.id };
  }

  const scriptContent = await blobResponse.text();
  const rules = parseSieveScript(scriptContent);

  return { rules, scriptId: script.id };
}

/** Save rules as a Sieve script via JMAP SieveScript/set */
async function saveFilterRules(params: {
  rules: FilterRule[];
  existingScriptId: string | null;
}): Promise<string> {
  const sieveContent = generateSieveScript(params.rules);

  // Upload the script content as a blob first
  const uploadResponse = await fetch("/api/jmap/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/sieve",
    },
    body: sieveContent,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload Sieve script");
  }

  const uploadResult = (await uploadResponse.json()) as { blobId: string };

  // Create or update the script
  let methodCalls: JMAPRequest["methodCalls"];

  if (params.existingScriptId) {
    methodCalls = [
      [
        "SieveScript/set",
        {
          update: {
            [params.existingScriptId]: {
              blobId: uploadResult.blobId,
            },
          },
        },
        "s0",
      ],
    ];
  } else {
    methodCalls = [
      [
        "SieveScript/set",
        {
          create: {
            newScript: {
              name: SCRIPT_NAME,
              blobId: uploadResult.blobId,
            },
          },
        },
        "s0",
      ],
    ];
  }

  const request: JMAPRequest = {
    using: SIEVE_USING,
    methodCalls,
  };

  const response = await jmapRequest(request);
  const [method, result] = response.methodResponses[0];

  if (method === "error") {
    throw new Error(
      (result as { description?: string }).description ?? "Failed to save Sieve script",
    );
  }

  const setResult = result as {
    created?: Record<string, { id: string }>;
    notCreated?: Record<string, { description?: string }>;
    notUpdated?: Record<string, { description?: string }>;
  };

  if (setResult.notCreated?.newScript) {
    throw new Error(
      setResult.notCreated.newScript.description ?? "Failed to create Sieve script",
    );
  }

  if (params.existingScriptId && setResult.notUpdated?.[params.existingScriptId]) {
    throw new Error(
      setResult.notUpdated[params.existingScriptId].description ?? "Failed to update Sieve script",
    );
  }

  return setResult.created?.newScript?.id ?? params.existingScriptId ?? "";
}

/** Hook for managing filter rules */
export function useFilterRules() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["filterRules"],
    queryFn: fetchFilterRules,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: saveFilterRules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["filterRules"] });
      toast.success("Filter rules saved");
    },
    onError: (error: Error) => {
      toast.error(`Failed to save rules: ${error.message}`);
    },
  });

  const rules = query.data?.rules ?? [];
  const scriptId = query.data?.scriptId ?? null;

  const saveRules = useCallback(
    (updatedRules: FilterRule[]) => {
      saveMutation.mutate({
        rules: updatedRules,
        existingScriptId: scriptId,
      });
    },
    [saveMutation, scriptId],
  );

  return {
    rules,
    scriptId,
    isLoading: query.isLoading,
    error: query.error,
    saveRules,
    isSaving: saveMutation.isPending,
  };
}
