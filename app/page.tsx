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
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Define the structure for slip data
interface SCBSlipData {
  source_id: string;
  file_name: string;
  bank_from: string;
  bank_to: string;
  status: string;
  date_time_text: string;
  date_time_iso: string;
  from?: {
    name: string;
    account_number: string;
  };
  to?: {
    name: string;
    account_number: string;
    biller_id?: string;
    store_code?: string;
    transaction_code?: string;
  };
  amount: number;
  currency: string;
  fee: number;
  transaction_reference: string;
  reference_number: string;
  reference_code: string;
  qr_code: string;
}

// Define the structure for extracted text data
interface ExtractedTextData {
  id: string;
  text: string;
  fileName: string;
  fileSize: number;
}

export default function Home() {
  const [files, setFiles] = useState<File[] | undefined>();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number>(0);
  const [slipData, setSlipData] = useState<SCBSlipData[] | null>(null);
  const [processedSlips, setProcessedSlips] = useState<SCBSlipData[]>([]);
  const [activeTab, setActiveTab] = useState("upload");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<number>(0);
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

  // Generate preview URLs when files change
  useEffect(() => {
    if (files && files.length > 0) {
      // Revoke previous preview URLs to avoid memory leaks
      previewUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });

      // Create new preview URLs for all files (up to 5)
      const newPreviewUrls = Array.from(files)
        .slice(0, 5)
        .map((file) => {
          return URL.createObjectURL(file);
        });

      setPreviewUrls(newPreviewUrls);
      setSelectedPreviewIndex(0); // Reset to first image

      // Clean up function to revoke URLs when component unmounts or files change
      return () => {
        newPreviewUrls.forEach((url) => {
          URL.revokeObjectURL(url);
        });
      };
    } else {
      // Clear preview URLs if no files
      setPreviewUrls([]);
    }
  }, [files]);

  const handleFileChange = (acceptedFiles: File[]) => {
    setFiles((prevFiles) => {
      // If no previous files, just use the new ones
      if (!prevFiles || prevFiles.length === 0) {
        return acceptedFiles;
      }

      // Combine existing files with new ones
      const combinedFiles = [...prevFiles, ...acceptedFiles];

      // Limit to 3 files maximum
      const limitedFiles = combinedFiles.slice(0, 3);

      // Show toast if files were limited
      if (combinedFiles.length > 3) {
        toast.info(
          `Only 3 files allowed. ${
            combinedFiles.length - 3
          } file(s) were not added.`
        );
      }

      return limitedFiles;
    });
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      toast.error("Please select a file");
      return;
    }

    setIsUploading(true);

    try {
      let processedCount = 0;
      let successCount = 0;
      const extractedTextItems: ExtractedTextData[] = [];

      // Process each file sequentially for OCR
      for (const file of files) {
        try {
          // Update processing status
          toast.info(
            `Extracting text from image ${processedCount + 1} of ${
              files.length
            }`
          );

          // Create form data for this file
          const formData = new FormData();
          formData.append("file", file);

          // OCR API call
          const ocrResponse = await fetch("/api/ocr", {
            method: "POST",
            body: formData,
          });

          if (!ocrResponse.ok) {
            const errorData = await ocrResponse.json();
            throw new Error(errorData.error || "Failed to extract text");
          }

          const ocrData = await ocrResponse.json();

          // Store extracted text from OCR response
          const extractedItem = {
            id: `slip-${Date.now()}-${processedCount}`,
            text: ocrData.text,
            fileName: file.name,
            fileSize: file.size,
          };

          extractedTextItems.push(extractedItem);

          successCount++;
          processedCount++;
        } catch (error) {
          console.error(
            `Error extracting text from image ${processedCount + 1}:`,
            error
          );
          toast.error(
            `Error extracting text from image ${processedCount + 1}`,
            {
              description:
                error instanceof Error ? error.message : String(error),
            }
          );
          processedCount++;
        }
      }

      // If any texts were successfully extracted, process them with AI
      if (successCount > 0) {
        toast.success(
          `Successfully extracted text from ${successCount} of ${files.length} images. Processing with AI...`
        );

        try {
          // Call our AI classification API endpoint
          const classifyResponse = await fetch("/api/classify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              texts: extractedTextItems,
            }),
          });

          if (!classifyResponse.ok) {
            const errorData = await classifyResponse.json();
            throw new Error(errorData.error || "Failed to classify text");
          }

          const data: { slips: SCBSlipData[] } = await classifyResponse.json();
          setSlipData(data.slips);

          // Add the processed slip to our collection
          setProcessedSlips((prev) => [...prev, ...data.slips]);

          setActiveTab("result");
          toast.success("Processing complete", {
            description: `${successCount} slip(s) processed successfully.`,
          });
        } catch (error) {
          console.error("Error processing text:", error);
          toast.error("Error processing text", {
            description:
              error instanceof Error
                ? error.message
                : "There was a problem classifying the extracted text.",
          });
        }
      } else {
        toast.error("No text could be extracted from the images");
      }
    } catch (error) {
      console.error("Error in OCR processing:", error);
      toast.error("Error in OCR processing", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle adding another slip
  const handleAddAnotherSlip = () => {
    // Reset for next slip
    setFiles(undefined);
    setPreviewUrls([]);
    setSelectedPreviewIndex(0);
    setSelectedTextIndex(0);
    setSlipData([]);
    setActiveTab("upload");
    toast.success("Ready for next slip", {
      description: "You can now upload another slip.",
    });
  };

  // Generate CSV from slip data
  const generateCSV = (slips: SCBSlipData[]): string => {
    // Define headers
    const headers = [
      "Source ID",
      "File Name",
      "Bank From",
      "Bank To",
      "Status",
      "Date/Time Text",
      "Date/Time ISO",
      "Reference Number",
      "Transaction Reference",
      "Reference Code",
      "Amount",
      "Fee",
      "Currency",
      "QR Code",
      "From Name",
      "From Account",
      "To Name",
      "To Account",
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
        `"${slip.source_id || ""}"`,
        `"${slip.file_name || ""}"`,
        `"${slip.bank_from || ""}"`,
        `"${slip.bank_to || ""}"`,
        `"${slip.status || ""}"`,
        `"${slip.date_time_text || ""}"`,
        `"${slip.date_time_iso || ""}"`,
        `"${slip.reference_number || ""}"`,
        `"${slip.transaction_reference || ""}"`,
        `"${slip.reference_code || ""}"`,
        slip.amount,
        slip.fee,
        `"${slip.currency || ""}"`,
        `"${slip.qr_code || ""}"`,
        `"${slip.from?.name || ""}"`,
        `"${slip.from?.account_number || ""}"`,
        `"${slip.to?.name || ""}"`,
        `"${slip.to?.account_number || ""}"`,
        `"${slip.to?.biller_id || ""}"`,
        `"${slip.to?.store_code || ""}"`,
        `"${slip.to?.transaction_code || ""}"`,
      ];
      csvContent += row.join(",") + "\n";
    });

    return csvContent;
  };

  // Handle exporting all processed slips
  const handleExportSlips = () => {
    if (processedSlips.length === 0) return;

    // Generate CSV content
    const csvContent = generateCSV(processedSlips);

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
        <p className="text-muted-foreground text-center">
          Upload your slip image and let AI extract, classify, and organize the
          information for you.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="max-w-3xl mx-auto"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="result" disabled={!slipData}>
            Result
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload Slip</CardTitle>
              <CardDescription>
                Upload a bank slip image to extract information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full items-center gap-4">
                <div className="mb-4">
                  <Label htmlFor="supported-banks">Supported Banks</Label>
                  <div className="mt-2 p-3 border rounded-md bg-muted/20">
                    <p className="text-sm">
                      This application supports slips from the following banks:
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Avatar>
                        <AvatarImage src="/SCB.svg" />
                        <AvatarFallback>SCB</AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarImage src="/BBL.svg" />
                        <AvatarFallback>BBL</AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarImage src="/Krungsri.svg" />
                        <AvatarFallback>Krungsri</AvatarFallback>
                      </Avatar>
                    </div>
                  </div>
                </div>

                <div
                  className={cn("grid", "gap-4", {
                    "md:grid-cols-2": previewUrls.length,
                  })}
                >
                  <Dropzone
                    multiple
                    maxFiles={3}
                    maxSize={2 * 1024 * 1024} // 2MB
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

                  {/* Image Previews */}
                  {previewUrls.length > 0 && files && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h1 className="text-sm font-medium">
                          Previews ({previewUrls.length})
                        </h1>
                        <p className="text-xs text-muted-foreground">
                          {files.length} file(s) selected
                        </p>
                      </div>

                      {/* Thumbnail Navigation */}
                      {previewUrls.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {previewUrls.map((url, index) => (
                            <div
                              key={index}
                              onClick={() => setSelectedPreviewIndex(index)}
                              className={`relative h-16 w-16 rounded-md overflow-hidden border cursor-pointer ${
                                index === selectedPreviewIndex
                                  ? "border-purple-600 border-2"
                                  : "border-border border-2"
                              }`}
                            >
                              <Image
                                src={url}
                                alt={`Thumbnail ${index + 1}`}
                                fill
                                className="object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Main Preview */}
                      <div className="relative rounded-md overflow-hidden border border-border p-2">
                        {files[selectedPreviewIndex].type.startsWith(
                          "image/"
                        ) ? (
                          <div className="relative h-[200px] w-full">
                            <Image
                              src={previewUrls[selectedPreviewIndex]}
                              alt={`Preview ${selectedPreviewIndex + 1}`}
                              fill
                              className="object-contain"
                              sizes="(max-width: 768px) 100vw, 50vw"
                            />
                          </div>
                        ) : (
                          <div className="p-4 text-center bg-muted">
                            <p className="text-sm text-muted-foreground">
                              {files[selectedPreviewIndex].name} (
                              {(
                                files[selectedPreviewIndex].size / 1024
                              ).toFixed(2)}{" "}
                              KB)
                            </p>
                          </div>
                        )}
                        <div className="mt-2 text-xs text-muted-foreground text-center">
                          {selectedPreviewIndex + 1} of {previewUrls.length}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="grid md:grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => setFiles(undefined)}
                disabled={!files || files.length === 0 || isUploading}
              >
                Clear
              </Button>

              <Button
                onClick={handleUpload}
                disabled={!files || files.length === 0 || isUploading}
              >
                {isUploading ? "Processing..." : "Upload & Process"}
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
              {slipData && slipData.length > 0 && (
                <div className="space-y-4">
                  {/* Navigation between processed slips if multiple */}
                  {slipData.length > 1 && (
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-medium">
                        Processed Slip {selectedTextIndex + 1} of{" "}
                        {slipData.length}
                      </h3>
                      <div className="flex gap-2">
                        {slipData.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => setSelectedTextIndex(index)}
                            className={`px-3 py-1 rounded-md text-xs ${
                              index === selectedTextIndex
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            Slip {index + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Display the processed slip data */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium">
                        Transaction Details
                      </h3>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            File Name:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.file_name || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Bank From:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.bank_from || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Bank To:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.bank_to || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Status:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.status || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Date/Time:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.date_time_text ||
                              "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Reference Number:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.reference_number ||
                              "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Transaction Reference:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]
                              ?.transaction_reference || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Reference Code:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.reference_code ||
                              "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Amount:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.amount
                              ? slipData[
                                  selectedTextIndex
                                ].amount.toLocaleString()
                              : "0"}{" "}
                            {slipData[selectedTextIndex]?.currency || "THB"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Fee:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.fee
                              ? slipData[selectedTextIndex].fee.toLocaleString()
                              : "0"}{" "}
                            {slipData[selectedTextIndex]?.currency || "THB"}
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
                            {slipData[selectedTextIndex]?.from?.name || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-muted-foreground">
                            Account:
                          </span>
                          <span className="text-xs font-medium">
                            {slipData[selectedTextIndex]?.from
                              ?.account_number || "N/A"}
                          </span>
                        </div>
                      </div>

                      <h3 className="text-sm font-medium mt-4 mb-2">To</h3>
                      <div className="space-y-1">
                        {slipData[selectedTextIndex]?.to &&
                          Object.entries(slipData[selectedTextIndex].to).map(
                            ([key, value]) => {
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
                            }
                          )}
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
                                <TableCell>
                                  {slip.date_time_text || "N/A"}
                                </TableCell>
                                <TableCell>
                                  {slip.from?.name || "N/A"}
                                </TableCell>
                                <TableCell>{slip.to?.name || "N/A"}</TableCell>
                                <TableCell className="text-right">
                                  {slip.amount
                                    ? slip.amount.toLocaleString()
                                    : "0"}{" "}
                                  {slip.currency || "THB"}
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
            <CardFooter className="grid md:grid-cols-3 auto-cols-fr gap-2">
              <Button variant="outline" onClick={() => setActiveTab("upload")}>
                Back
              </Button>
              {processedSlips.length > 0 && (
                <Button variant="outline" onClick={handleExportSlips}>
                  Export as CSV ({processedSlips.length})
                </Button>
              )}
              <Button onClick={handleAddAnotherSlip}>
                Process Another Slip
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
