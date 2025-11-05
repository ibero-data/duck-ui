// file: src/components/connection/Disclaimer.tsx
// description: Connection management component
// reference: https://github.com/ibero-data/duck-ui

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, GithubIcon } from "lucide-react";

export const ConnectionDisclaimer = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <Alert className="border-amber-500">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>External Connections (Alpha)</AlertTitle>
        <AlertDescription className="mt-2">
          This feature is in early development and should be used with caution.
          <Button
            variant="link"
            className="px-0 text-amber-500 hover:text-amber-400 ml-2"
            onClick={() => setOpen(true)}
          >
            Read full disclaimer
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              External Connections Disclaimer
            </DialogTitle>
            <DialogDescription>
              Important information about using external connections
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6 pr-6">
              <section className="space-y-2">
                <h3 className="font-semibold">Alpha Status</h3>
                <p className="text-sm text-muted-foreground">
                  This external connection feature is currently in alpha stage
                  and is provided as a proof of concept. It is still under
                  active development and may undergo significant changes.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">Example of connection</h3>
                <p className="text-sm text-muted-foreground">
                  You can use the following connection string to connect to a
                  server (Quackpy) that has the HTTP Server Extension enabled:
                  <pre className="text-sm bg-secondary rounded-md p-2 mt-2">
                    <code>Host: https://quackpy.fly.dev</code>
                    <br />
                    <code>Port: 443</code>
                    <br />
                    <code>Database: - (leave empty)</code>
                    <br />
                    <code>User: duckui</code>
                    <br />
                    <code>Password: duckui</code>
                  </pre>
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">External Links</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Some interest links that you can check to understand more
                  </p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>
                      <a
                        href="https://duckdb.org/community_extensions/extensions/httpserver.html"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary"
                      >
                        DuckDB HTTP Server Extension
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://github.com/quackscience/duckdb-extension-httpserver"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary"
                      >
                        Github Repositorie
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://github.com/quackscience/quackpy"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary"
                      >
                        Quackscience - Quackpy Github Repositorie
                      </a>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">Technical Considerations</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    The current implementation supports basic authentication and
                    requires a compatible DuckDB server implementation with the
                    following specifications:
                  </p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>HTTP Basic Authentication</li>
                    <li>CORS enabled for cross-origin requests</li>
                    <li>Support for POST requests with query parameters</li>
                    <li>
                      Response format compatibility with ClickHouse
                      JSON/JSONCompact
                    </li>
                  </ul>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">Security Warning</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Please be aware of the following security considerations:
                  </p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Connection credentials are stored in local storage</li>
                    <li>
                      Communication may not be encrypted depending on server
                      configuration
                    </li>
                    <li>
                      No built-in protection against SQL injection or other
                      security vulnerabilities
                    </li>
                    <li>
                      Authentication implementation is basic and may not meet
                      security requirements
                    </li>
                  </ul>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">Limitations</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Current known limitations include:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Limited error handling and recovery</li>
                    <li>No support for advanced authentication methods</li>
                    <li>Performance may be impacted by network conditions</li>
                    <li>Schema and table information might be incomplete</li>
                    <li>Some DuckDB features may not be available</li>
                  </ul>
                </div>
              </section>

              <Alert variant="destructive" className="mt-4">
                <AlertTitle className="font-semibold">
                  Production Use Warning
                </AlertTitle>
                <AlertDescription className="mt-2">
                  This feature is not intended for production use or storing
                  sensitive data. Use at your own risk and only with
                  non-sensitive, test data.
                </AlertDescription>
              </Alert>
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button
              onClick={() => {
                // open issue link
                window.open(
                  "https://github.com/ibero-data/duck-ui/issues/new",
                  "_blank"
                );
              }}
            >
              <GithubIcon className="h-4 w-4" />
              Report Issue
            </Button>
            <Button onClick={() => setOpen(false)}>I Understand</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConnectionDisclaimer;
