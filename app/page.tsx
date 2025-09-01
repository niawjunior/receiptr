"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/ui/shadcn-io/dropzone";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Image from "next/image";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Define the structure for SCB slip data
interface SCBSlipData {
  bank: string;
  status: string;
  date_time: string;
  transaction_reference: string;
  from: {
    name: string;
    account_number: string;
  };
  to: {
    name: string;
    biller_id?: string;
    store_code?: string;
    transaction_code?: string;
  };
  amount: number;
  currency: string;
  qr_code?: string;
}

export default function Home() {
  const [files, setFiles] = useState<File[] | undefined>();
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [slipData, setSlipData] = useState<SCBSlipData | null>(null);
  const [processedSlips, setProcessedSlips] = useState<SCBSlipData[]>([]);
  const [activeTab, setActiveTab] = useState("upload");
  const [slipType, setSlipType] = useState("scb");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const customFields = [
    { name: "to.name", originalField: "to.name", displayName: "Recipient" },
    {
      name: "to.biller_id",
      originalField: "to.biller_id",
      displayName: "Biller ID",
    },
    {
      name: "to.store_code",
      originalField: "to.store_code",
      displayName: "Store Code",
    },
    {
      name: "to.transaction_code",
      originalField: "to.transaction_code",
      displayName: "Transaction Code",
    },
  ];

  // Generate preview URL when files change
  useEffect(() => {
    if (files && files.length > 0) {
      // Revoke previous preview URL to avoid memory leaks
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      // Create a new preview URL for the first file
      const objectUrl = URL.createObjectURL(files[0]);
      setPreviewUrl(objectUrl);

      // Clean up function to revoke the URL when component unmounts or files change
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    } else {
      // Clear preview URL if no files
      setPreviewUrl(null);
    }
  }, [files, previewUrl]);

  const handleFileChange = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      // Create form data for the API request
      const formData = new FormData();
      formData.append("file", files[0]);

      // Call our OCR API endpoint
      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to extract text");
      }

      const data = await response.json();
      const text = data.text;

      if (text) {
        setExtractedText(text);
        setActiveTab("process");
        toast.success("The text has been extracted from your slip.");
      } else {
        throw new Error("Failed to extract text");
      }
    } catch (error) {
      console.error("Error extracting text:", error);
      toast.error("Error extracting text", {
        description: "There was a problem extracting text from your slip.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!extractedText) return;

    setIsProcessing(true);

    try {
      // Call our AI classification API endpoint
      const classifyResponse = await fetch("/api/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: extractedText }),
      });

      if (!classifyResponse.ok) {
        const errorData = await classifyResponse.json();
        throw new Error(errorData.error || "Failed to classify text");
      }

      const data: SCBSlipData = await classifyResponse.json();
      setSlipData(data);

      // Add the processed slip to our collection
      setProcessedSlips((prev) => [...prev, data]);

      setActiveTab("result");
      toast.success("Processing complete", {
        description: "The slip has been processed successfully.",
      });
    } catch (error) {
      console.error("Error processing text:", error);
      toast.error("Error processing text", {
        description: "There was a problem classifying the extracted text.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle adding another slip
  const handleAddAnotherSlip = () => {
    // Reset for next slip
    setFiles(undefined);
    setPreviewUrl(null);
    setExtractedText(null);
    setSlipData(null);
    setActiveTab("upload");
    toast.success("Ready for next slip", {
      description: "You can now upload another slip.",
    });
  };

  // Convert slips data to CSV format
  const convertToCSV = (slips: SCBSlipData[]) => {
    if (slips.length === 0) return "";

    // Define CSV headers
    const headers = [
      "Bank",
      "Status",
      "Date/Time",
      "Reference",
      "Amount",
      "Currency",
      "From Name",
      "From Account",
      "To Name",
      "To Biller ID",
      "To Store Code",
      "To Transaction Code",
    ];

    // Create CSV header row
    let csvContent = headers.join(",") + "\n";

    // Add data rows
    slips.forEach((slip) => {
      const row = [
        // Escape values that might contain commas
        `"${slip.bank || ""}"`,
        `"${slip.status || ""}"`,
        `"${slip.date_time || ""}"`,
        `"${slip.transaction_reference || ""}"`,
        slip.amount,
        `"${slip.currency || ""}"`,
        `"${slip.from.name || ""}"`,
        `"${slip.from.account_number || ""}"`,
        `"${slip.to.name || ""}"`,
        `"${slip.to.biller_id || ""}"`,
        `"${slip.to.store_code || ""}"`,
        `"${slip.to.transaction_code || ""}"`,
      ];
      csvContent += row.join(",") + "\n";
    });

    return csvContent;
  };

  // Handle exporting all processed slips
  const handleExportSlips = () => {
    if (processedSlips.length === 0) return;

    // Generate CSV content
    const csvContent = convertToCSV(processedSlips);

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slips_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Export complete", {
      description: `${processedSlips.length} slips exported as CSV successfully.`,
    });
  };

  // Calculate total amount from all processed slips
  const totalAmount = processedSlips.reduce(
    (sum, slip) => sum + (slip.amount || 0),
    0
  );

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col items-center justify-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Sliptr</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Upload your slip image and let AI extract, classify, and organize the
          information for you.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="max-w-3xl mx-auto"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="process" disabled={!extractedText}>
            Process
          </TabsTrigger>
          <TabsTrigger value="result" disabled={!slipData}>
            Result
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload Slip</CardTitle>
              <CardDescription>
                Select slip type and upload an image to extract information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full items-center gap-4">
                <div className="mb-4">
                  <Label htmlFor="slip-type">Slip Type</Label>
                  <Select value={slipType} onValueChange={setSlipType}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scb">
                        SCB (Siam Commercial Bank)
                      </SelectItem>
                      {/* Add more bank options in the future */}
                    </SelectContent>
                  </Select>
                </div>

                <div
                  className={`grid gap-4 ${
                    previewUrl ? "grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  <Dropzone
                    maxFiles={1}
                    maxSize={10 * 1024 * 1024} // 10MB
                    accept={{
                      "image/*": [".png", ".jpg", ".jpeg"],
                    }}
                    onDrop={handleFileChange}
                    onError={(error) => {
                      toast.error("Error uploading file", {
                        description: error.message,
                      });
                    }}
                    src={files}
                    className="cursor-pointer"
                  >
                    <DropzoneEmptyState />
                    <DropzoneContent />
                  </Dropzone>
                  {/* Image Preview */}
                  {previewUrl && files && files[0] && (
                    <div className="relative rounded-md overflow-hidden border border-border p-2">
                      <h1 className="text-sm font-medium mb-2">Preview</h1>
                      {files[0].type.startsWith("image/") ? (
                        <div className="relative h-[200px] w-full">
                          <Image
                            src={previewUrl}
                            alt="Preview"
                            fill
                            className="object-contain"
                            sizes="(max-width: 200px) 100vw, 200px"
                          />
                        </div>
                      ) : (
                        <div className="p-4 text-center bg-muted">
                          <p className="text-sm text-muted-foreground">
                            {files[0].name} ({(files[0].size / 1024).toFixed(2)}{" "}
                            KB)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setFiles(undefined)}
                disabled={!files || files.length === 0 || isUploading}
              >
                Clear
              </Button>
              <Button
                onClick={handleExportSlips}
                disabled={processedSlips.length === 0}
              >
                Export as CSV
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!files || files.length === 0 || isUploading}
              >
                {isUploading ? "Uploading..." : "Upload & Extract Text"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="process">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Text</CardTitle>
              <CardDescription>
                Review the extracted text and process it with AI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full items-center gap-4">
                <div className="p-4 bg-muted rounded-md max-h-[300px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{extractedText}</pre>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("upload")}>
                Back
              </Button>
              <Button onClick={handleProcess} disabled={isProcessing}>
                {isProcessing ? "Processing..." : "Process with AI"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="result">
          <Card>
            <CardHeader>
              <CardTitle>Processed Slip</CardTitle>
              <CardDescription>
                Review the extracted information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {slipData && (
                <div className="space-y-4">
                  {/* Display the processed slip data */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium">
                        Transaction Details
                      </h3>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Bank:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData.bank}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Status:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData.status}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Date/Time:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData.date_time}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Reference:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData.transaction_reference}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Amount:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData.amount.toLocaleString()}{" "}
                            {slipData.currency}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium mb-2">From</h3>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Name:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData.from.name}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Account:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData.from.account_number}
                          </span>
                        </div>
                      </div>

                      <h3 className="text-sm font-medium mt-4 mb-2">To</h3>
                      <div className="space-y-1">
                        {Object.entries(slipData.to).map(([key, value]) => {
                          const customField = customFields.find(
                            (f) => f.originalField === `to.${key}`
                          );
                          return (
                            <div
                              key={key}
                              className="flex justify-between items-center"
                            >
                              <span className="text-xs text-muted-foreground">
                                {customField?.displayName || key}:
                              </span>
                              <span className="text-xs font-medium">
                                {value}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Summary of all processed slips */}
                  {processedSlips.length > 0 && (
                    <div className="mt-6 pt-4 border-t">
                      <h3 className="text-sm font-medium mb-4">
                        All Processed Slips ({processedSlips.length})
                      </h3>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableCaption>
                            Summary of all processed slips
                          </TableCaption>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">#</TableHead>
                              <TableHead>Date/Time</TableHead>
                              <TableHead>From</TableHead>
                              <TableHead>To</TableHead>
                              <TableHead className="text-right">
                                Amount
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {processedSlips.map((slip, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  {index + 1}
                                </TableCell>
                                <TableCell>{slip.date_time}</TableCell>
                                <TableCell>{slip.from.name}</TableCell>
                                <TableCell>{slip.to.name || "N/A"}</TableCell>
                                <TableCell className="text-right">
                                  {slip.amount.toLocaleString()} {slip.currency}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="text-right font-medium"
                              >
                                Total:
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {totalAmount.toLocaleString()} THB
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("process")}>
                Back
              </Button>
              <div className="flex gap-2">
                {processedSlips.length > 0 && (
                  <Button variant="outline" onClick={handleExportSlips}>
                    Export as CSV ({processedSlips.length})
                  </Button>
                )}
                <Button onClick={handleAddAnotherSlip}>
                  Process Another Slip
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
