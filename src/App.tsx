/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Camera, RefreshCw, User, Activity, Globe, Ruler, Calendar, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini AI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface AnalysisResult {
  bmi: number;
  age: number;
  heightCm: number;
  weightStatus: string;
  nationality: string;
  confidence: number;
  advice: string;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      setError(null);
      setIsCameraActive(true);
      // We'll handle the stream attachment in a useEffect or after a short delay
      // to ensure the video element is rendered
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต");
    }
  };

  // Effect to handle camera stream when active
  React.useEffect(() => {
    let stream: MediaStream | null = null;

    const enableCamera = async () => {
      if (isCameraActive) {
        try {
          // Small delay to ensure video element is in DOM
          await new Promise(resolve => setTimeout(resolve, 100));
          
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false 
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Ensure it plays
            videoRef.current.play().catch(e => console.error("Play error:", e));
          }
        } catch (err) {
          console.error("Error accessing camera inside effect:", err);
          setError("ไม่สามารถเข้าถึงกล้องได้: " + (err instanceof Error ? err.message : String(err)));
          setIsCameraActive(false);
        }
      }
    };

    enableCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive]);

  const stopCamera = () => {
    setIsCameraActive(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        // Mirror the capture to match the preview
        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.restore();
        
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImage(dataUrl);
        stopCamera();
        analyzeImage(dataUrl);
      }
    }
  };

  const analyzeImage = async (base64Image: string) => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      // Check multiple possible sources for the API Key
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      // Check if API Key is missing or still using placeholder
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "undefined" || apiKey === "") {
        throw new Error("MISSING_API_KEY");
      }

      const base64Data = base64Image.split(',')[1];
      
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              },
              {
                text: "วิเคราะห์ลักษณะทางกายภาพของบุคคลในภาพนี้ และประมาณค่าดังต่อไปนี้: BMI (ตัวเลข), อายุ (ตัวเลข), ส่วนสูงในหน่วยซม. (ตัวเลข), สถานะน้ำหนัก (เช่น ผอม, ปกติ, ท้วม, อ้วน), และสัญชาติที่เป็นไปได้มากที่สุด ให้คำแนะนำสุขภาพสั้นๆ ด้วย ตอบกลับในรูปแบบ JSON เท่านั้น"
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bmi: { type: Type.NUMBER },
              age: { type: Type.NUMBER },
              heightCm: { type: Type.NUMBER },
              weightStatus: { type: Type.STRING },
              nationality: { type: Type.STRING },
              confidence: { type: Type.NUMBER, description: "ความมั่นใจในการวิเคราะห์ 0-1" },
              advice: { type: Type.STRING }
            },
            required: ["bmi", "age", "heightCm", "weightStatus", "nationality", "advice"]
          }
        }
      });

      const analysisText = response.text;
      if (analysisText) {
        const parsedResult = JSON.parse(analysisText) as AnalysisResult;
        setResult(parsedResult);
      } else {
        throw new Error("EMPTY_RESPONSE");
      }
    } catch (err) {
      console.error("Analysis error:", err);
      if (err instanceof Error && err.message === "MISSING_API_KEY") {
        setError("ไม่พบ API Key: กรุณาตั้งค่า GEMINI_API_KEY ใน Environment Variables ของ Vercel");
      } else {
        setError("เกิดข้อผิดพลาดในการวิเคราะห์ภาพ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่อีกครั้ง");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setIsCameraActive(false);
  };

  const getBMICategoryColor = (bmi: number) => {
    if (bmi < 18.5) return 'text-blue-500';
    if (bmi < 25) return 'text-green-500';
    if (bmi < 30) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-8 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold tracking-tight mb-2"
          >
            AI Body Analyzer
          </motion.h1>
          <p className="text-muted-foreground">วิเคราะห์ร่างกายและสุขภาพเบื้องต้นด้วย AI</p>
        </header>

        <main className="space-y-6">
          {/* Camera / Image Section */}
          <section className="bg-black rounded-3xl shadow-sm overflow-hidden border border-black/5 relative aspect-[4/3] flex items-center justify-center">
            {!image && !isCameraActive && (
              <div className="text-center p-8 bg-white w-full h-full flex flex-col items-center justify-center">
                <div 
                  className="w-20 h-20 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 cursor-pointer hover:scale-105 transition-transform" 
                  onClick={startCamera}
                >
                  <Camera size={32} />
                </div>
                <p className="font-medium">กดเพื่อเริ่มการสแกน</p>
                <p className="text-sm text-muted-foreground mt-1">กรุณายืนในที่ที่มีแสงสว่างเพียงพอ</p>
              </div>
            )}

            {isCameraActive && !image && (
              <div className="relative w-full h-full bg-black">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover scale-x-[-1] brightness-125"
                  onLoadedMetadata={() => {
                    if (videoRef.current) videoRef.current.play();
                  }}
                />
                <div className="absolute bottom-8 left-0 right-0 flex justify-center space-x-4">
                  <button 
                    onClick={capturePhoto}
                    className="w-16 h-16 bg-white rounded-full border-4 border-black/20 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                  >
                    <div className="w-12 h-12 bg-red-500 rounded-full" />
                  </button>
                  <button 
                    onClick={stopCamera}
                    className="absolute right-8 bottom-4 text-white bg-black/40 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {image && (
              <div className="relative w-full h-full">
                <img src={image} alt="Captured" className="w-full h-full object-cover" />
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-white">
                    <Loader2 className="animate-spin mb-4" size={48} />
                    <p className="text-lg font-medium animate-pulse">กำลังวิเคราะห์ร่างกาย...</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Error Message */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl flex items-start space-x-3"
            >
              <AlertCircle className="shrink-0 mt-0.5" size={20} />
              <p>{error}</p>
            </motion.div>
          )}

          {/* Results Section */}
          {result && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 gap-4">
                <ResultCard 
                  icon={<Activity className="text-indigo-500" />} 
                  label="BMI" 
                  value={result.bmi.toFixed(1)} 
                  subValue={result.weightStatus}
                  valueColor={getBMICategoryColor(result.bmi)}
                />
                <ResultCard 
                  icon={<Calendar className="text-orange-500" />} 
                  label="อายุโดยประมาณ" 
                  value={`${result.age}`} 
                  subValue="ปี"
                />
                <ResultCard 
                  icon={<Ruler className="text-emerald-500" />} 
                  label="ส่วนสูง" 
                  value={`${result.heightCm}`} 
                  subValue="ซม."
                />
                <ResultCard 
                  icon={<Globe className="text-blue-500" />} 
                  label="สัญชาติที่เป็นไปได้" 
                  value={result.nationality} 
                  subValue="วิเคราะห์จากลักษณะเด่น"
                />
              </div>

              <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
                <div className="flex items-center space-x-2 mb-3">
                  <CheckCircle2 className="text-green-500" size={20} />
                  <h3 className="font-bold">คำแนะนำสุขภาพ</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {result.advice}
                </p>
              </div>

              <button 
                onClick={reset}
                className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 hover:bg-zinc-800 transition-colors"
              >
                <RefreshCw size={20} />
                <span>สแกนใหม่อีกครั้ง</span>
              </button>
            </motion.div>
          )}
        </main>

        <footer className="mt-12 text-center text-xs text-muted-foreground pb-8">
          <p>หมายเหตุ: การวิเคราะห์นี้เป็นการประมาณการโดย AI เท่านั้น ไม่สามารถใช้แทนการวินิจฉัยทางการแพทย์ได้</p>
        </footer>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function ResultCard({ icon, label, value, subValue, valueColor = "text-black" }: { 
  icon: React.ReactNode, 
  label: string, 
  value: string, 
  subValue: string,
  valueColor?: string
}) {
  return (
    <div className="bg-white p-5 rounded-3xl border border-black/5 shadow-sm flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-4">
        <span className="p-2 bg-gray-50 rounded-xl">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
      </div>
      <div>
        <div className={`text-3xl font-bold ${valueColor}`}>{value}</div>
        <div className="text-xs text-muted-foreground font-medium mt-1">{subValue}</div>
      </div>
    </div>
  );
}
