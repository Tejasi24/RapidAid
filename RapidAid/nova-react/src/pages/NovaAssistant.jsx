import React, { useState, useEffect, useRef } from 'react';
import NovaVoiceCard from '../components/NovaVoiceCard';
import ChatSection from '../components/ChatSection';
import { generateNovaResponse } from '../services/geminiService';

export default function NovaAssistant() {
  // Verify Vite env setup without exposing the key directly to frontend markup
  const geminiEnvKey = import.meta.env.VITE_GEMINI_API_KEY;

  const [isActivated, setIsActivated] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [state, setState] = useState('idle'); // 'idle' | 'listening' | 'speaking' | 'thinking'
  const [messages, setMessages] = useState([]);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);
  const currentUtteranceRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const chatSessionRef = useRef({
    hasSubmittedReport: null,
    currentQuestionIndex: 0,
    answers: {},
  });

  // 1. Initial Speech Recognition & Synthesis Setup
  useEffect(() => {
    // Force reset any stale localStorage values immediately on mount
    localStorage.removeItem('nova_activated');
    localStorage.removeItem('nova_messages');

    // Force reset all states to default to ensure a clean start
    setIsActivated(false);
    setMessages([]);
    setState('idle');
    setHoldProgress(0);
    setIsHolding(false);
    chatSessionRef.current = {
      hasSubmittedReport: null,
      currentQuestionIndex: 0,
      answers: {},
    };

    // Handle bfcache (back-forward cache) to force a fresh page reload when user navigates back
    const handlePageShow = (event) => {
      if (event.persisted) {
        window.location.reload();
      } else {
        setIsActivated(false);
        setMessages([]);
        setState('idle');
        setHoldProgress(0);
        setIsHolding(false);
        chatSessionRef.current = {
          hasSubmittedReport: null,
          currentQuestionIndex: 0,
          answers: {},
        };
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    // Setup Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      
      rec.onstart = () => {
        setState('listening');
      };
      
      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript.trim()) {
          handleUserVoiceInput(transcript);
        }
      };
      
      rec.onerror = (err) => {
        console.error('Speech recognition error:', err);
        if (err.error !== 'no-speech') {
          setState('idle');
        }
      };
      
      rec.onend = () => {
        setState(prev => (prev === 'listening' ? 'idle' : prev));
      };
      
      recognitionRef.current = rec;
    } else {
      console.warn('SpeechRecognition is not supported in this browser.');
    }

    // Setup Speech Synthesis
    if (window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
    }

    return () => {
      stopHoldTimer();
      cancelSpeech();
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // 2. Activation Hold Logic (2 seconds)
  const startHoldTimer = () => {
    if (isActivated) return;
    setIsHolding(true);
    setHoldProgress(0);
    const startTime = Date.now();
    const duration = 2000; // 2 seconds

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(holdIntervalRef.current);
        triggerActivation();
      }
    }, 50);
  };

  const stopHoldTimer = () => {
    setIsHolding(false);
    setHoldProgress(0);
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
    }
  };

  const triggerActivation = () => {
    setIsActivated(true);
    localStorage.setItem('nova_activated', 'true');
    
    // Play sound / speak intro
    speakText("Hi, I am Nova from RapidAid. I will stay with you until help arrives. Have you already submitted an accident report?");
    
    addMessage('nova', "Hi, I am Nova from RapidAid. I will stay with you until help arrives. Have you already submitted an accident report?");
  };

  // 3. Helper to add messages to log
  const addMessage = (role, text) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role, text, timestamp }]);
  };

  // 4. Speech Synthesis Speaker
  const speakText = (text) => {
    cancelSpeech();

    if (!synthRef.current) return;

    // Detect language using regex to adjust Speech Synthesis voice & rate
    let lang = 'en-IN';
    if (/[\u0900-\u097F]/.test(text)) {
      // Devanagari script covers Hindi, Marathi, etc.
      lang = 'hi-IN';
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0; // natural rate

    utterance.onstart = () => {
      setState('speaking');
    };

    utterance.onend = () => {
      setState('idle');
      // Automatically trigger listening after speaking to keep conversation flowing!
      startListeningDelayed();
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setState('idle');
    };

    currentUtteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const cancelSpeech = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setState('idle');
  };

  // 5. Speech Recognition Recorders
  const startListening = () => {
    cancelSpeech();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('SpeechRecognition is already running.');
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const startListeningDelayed = () => {
    setTimeout(() => {
      // Only start if not already talking or thinking
      setState(prev => {
        if (prev === 'idle') {
          startListening();
        }
        return prev;
      });
    }, 400);
  };

  // 6. Gemini Conversational Integration with Smart Fallback
  const handleUserVoiceInput = async (userInputText) => {
    addMessage('user', userInputText);
    setState('thinking');

    const systemInstruction = `You are Nova, an emergency assistant inside RapidAid.
You are calm and supportive.
You are not just a chatbot.
You stay with users until help arrives.
Never stop after one response.
Ask follow-up questions.
Remember previous conversation.
Reply in same language as user.
If user uses Hindi reply in Hindi.
If user uses Hinglish reply in Hinglish.
If user switches language automatically switch too.
Provide safe emergency guidance only.
Never diagnose diseases.
Never become silent after listening.`;

    try {
      // Call direct Gemini API frontend service
      const aiReply = await generateNovaResponse(userInputText, messages, systemInstruction);
      if (aiReply) {
        addMessage('nova', aiReply);
        speakText(aiReply);
        return;
      }
      
      // Fallback if backend API call fails or key is missing
      handleFallbackConversation(userInputText);
    } catch (err) {
      console.warn('Frontend Gemini call failed, initiating local fallback system:', err);
      handleFallbackConversation(userInputText);
    }
  };

  // 7. Advanced Local Fallback Conversational Engine
  const handleFallbackConversation = (input) => {
    const cleanInput = input.toLowerCase().trim();
    let reply = "";

    // Parse language script to reply in appropriate language
    const isHindiScript = /[\u0900-\u097F]/.test(input);
    const isHinglish = /kya|hai|hua|nahin|na|raha|bachao|chot|khoon/i.test(cleanInput);

    // Context & State Tracking
    const session = chatSessionRef.current;

    // CASE 1: Onboarding report status checking
    if (session.hasSubmittedReport === null) {
      if (cleanInput.includes('no') || cleanInput.includes('nahin') || cleanInput.includes('na')) {
        session.hasSubmittedReport = false;
        reply = isHindiScript 
          ? "यह महत्वपूर्ण है कि आप पहले दुर्घटना की रिपोर्ट जमा करें ताकि पास के एम्बुलेंस प्रदाता आपका अनुरोध प्राप्त कर सकें।"
          : isHinglish
          ? "Yeh important hai ki aap pehle accident report submit karein taaki nearby ambulance providers aapka request receive kar sakein."
          : "It is important to submit an accident report first so nearby ambulance providers can receive your request.";
        
        // Follow up with report steps guide
        setTimeout(() => {
          const stepsReply = isHindiScript
            ? "कैसे रिपोर्ट करें: \nचरण 1: दुर्घटना रिपोर्ट पर क्लिक करें\nचरण 2: रोगी का नाम दर्ज करें\nचरण 3: संपर्क नंबर दर्ज करें\nचरण 4: घायल लोगों की संख्या दर्ज करें\nचरण 5: स्थान पहुंच की अनुमति दें\nचरण 6: अनुरोध सबमिट करें पर दबाएं।\n\nकाम पूरा होने के बाद मुझे बताएं और मैं आपकी सहायता जारी रखूंगी।"
            : isHinglish
            ? "Report kaise karein:\nStep 1: 'Report Accident' par click karein\nStep 2: Patient ka naam dalein\nStep 3: Contact number enter karein\nStep 4: Injured logon ki sankhya enter karein\nStep 5: Location access allow karein\nStep 6: Request submit karein.\n\nKaam poora hone ke baad mujhe batayein aur main aapki madad jari rakhungi."
            : "To report: \nStep 1: Click 'Report Accident'\nStep 2: Enter patient name\nStep 3: Enter contact number\nStep 4: Enter number of injured people\nStep 5: Allow location access\nStep 6: Press Submit Request.\n\nTell me once you finish and I will continue helping you.";
          addMessage('nova', stepsReply);
          speakText(stepsReply);
        }, 1200);
      } else {
        session.hasSubmittedReport = true;
        reply = isHindiScript
          ? "ठीक है। जब तक एम्बुलेंस आ रही है, मैं आपके साथ रहूंगी।"
          : isHinglish
          ? "Theek hai. Main aapke saath rahungi jab tak ambulance aa rahi hai."
          : "Okay. I will stay with you while the ambulance is coming.";
      }
    }
    // CASE 2: Guide report steps if requested
    else if (!session.hasSubmittedReport && (cleanInput.includes('how') || cleanInput.includes('kaise') || cleanInput.includes('report'))) {
      reply = isHindiScript
        ? "चरण 1: दुर्घटना रिपोर्ट पर क्लिक करें। चरण 2: रोगी का नाम दर्ज करें। चरण 3: संपर्क नंबर दर्ज करें। चरण 4: घायल लोगों की संख्या दर्ज करें। चरण 5: स्थान पहुंच की अनुमति दें। चरण 6: अनुरोध सबमिट करें पर दबाएं।"
        : "Step 1: Click Report Accident. Step 2: Enter patient name. Step 3: Enter contact number. Step 4: Enter number of injured people. Step 5: Allow location access. Step 6: Press Submit Request.";
    } 
    // CASE 3: Active Emergency Diagnostic Loop
    else {
      // First-Aid Smart Guidances
      if (cleanInput.includes('bleed') || cleanInput.includes('khoon') || cleanInput.includes('blood')) {
        reply = isHindiScript
          ? "भारी खून बहने के लिए: साफ कपड़े का उपयोग करके घाव पर जोर से दबाव डालें। क्या आप खून बहना कम कर पा रहे हैं? क्या रोगी होश में है?"
          : isHinglish
          ? "Heavy bleeding ke liye: Saaf kapde ka use karke ghaav par zoor se pressure apply karein. Kya bleeding thoda kam hua hai? Kya patient conscious hai?"
          : "For heavy bleeding: Apply firm pressure on the wound using a clean cloth. Is the bleeding heavy or light? Is the person conscious?";
      } 
      else if (cleanInput.includes('fracture') || cleanInput.includes('bone') || cleanInput.includes('haddi') || cleanInput.includes('broken')) {
        reply = isHindiScript
          ? "हड्डी टूटने के लिए: घायल हिस्से को बिल्कुल न हिलाएं। क्या रोगी उस हिस्से को हिलाने की कोशिश कर रहा है? उसे स्थिर रखें।"
          : isHinglish
          ? "Fracture ke liye: Injured area ko bilkul mat hilayein. Patient ko comfortable rakhein aur use seedha letayein. Kya patient hosh mein hai?"
          : "For a fracture: Do not move the injured area. Keep the person completely still. Is there any open wound visible?";
      } 
      else if (cleanInput.includes('burn') || cleanInput.includes('jalna') || cleanInput.includes('fire')) {
        reply = isHindiScript
          ? "जलने के लिए: साफ ठंडे पानी का उपयोग करके घाव को ठंडा करें। क्या प्रभावित क्षेत्र बड़ा है? बर्फ का उपयोग न करें।"
          : isHinglish
          ? "Burn ke liye: Saaf thande paani se jale hue area ko cool karein. Ice bilkul mat lagana. Kya patient normal saans le raha hai?"
          : "For burns: Cool the area using clean, cold running water. Do not apply ice or ointments. Can you tell me if the skin is blistered?";
      } 
      else if (cleanInput.includes('head') || cleanInput.includes('sir') || cleanInput.includes('chot')) {
        reply = isHindiScript
          ? "सिर की चोट के लिए: रोगी को पूरी तरह स्थिर रखें और हिलाएं नहीं। क्या रोगी बात कर पा रहा है या बेहोश है?"
          : isHinglish
          ? "Head injury ke liye: Patient ko bilkul mat hilayein aur shaant rakhein. Kya patient baat kar pa raha hai?"
          : "For a head injury: Keep the person completely still. Do not move their neck. Is the person conscious and awake?";
      } 
      else if (cleanInput.includes('unconscious') || cleanInput.includes('behos') || cleanInput.includes('faint')) {
        reply = isHindiScript
          ? "बेहोश रोगी के लिए: वायुमार्ग को साफ रखें। रोगी का सिर धीरे से पीछे झुकाएं और सांस की जांच करें। क्या सांस सामान्य है?"
          : isHinglish
          ? "Behosh patient ke liye: Airway ko clear rakhein, head thoda piche karke chin lift karein. Kya saans normal chal rahi hai?"
          : "If the person is unconscious but breathing: Keep their airway clear. Tilt their head back slightly. Is breathing normal?";
      } 
      else if (cleanInput.includes('chest') || cleanInput.includes('heart') || cleanInput.includes('dard')) {
        reply = isHindiScript
          ? "सीने में दर्द के लिए: रोगी को आरामदायक अर्ध-बैठी स्थिति में रखें। उसे शांत रखने की कोशिश करें।"
          : isHinglish
          ? "Chest pain ke liye: Patient ko comfortable aur aaramdayak position mein bithayein. Unhe bilkul panic na hone dein."
          : "For chest pain: Keep the person fully comfortable and seated semi-upright. Keep them calm. Help is on the way.";
      } 
      else if (cleanInput.includes('breath') || cleanInput.includes('saans') || cleanInput.includes('suffocat')) {
        reply = isHindiScript
          ? "सांस की तकलीफ के लिए: रोगी को शांत रखें। उसे गहरी और धीमी सांस लेने में मदद करें।"
          : isHinglish
          ? "Saans lene mein taklif ke liye: Patient ko shant rakhein aur tight clothes dheele karein. Deep breath lene ko kahein."
          : "For breathing issues: Keep the patient fully calm. Loosen tight clothing. Are they able to speak?";
      } 
      else if (cleanInput.includes('scared') || cleanInput.includes('panic') || cleanInput.includes('dar') || cleanInput.includes('help')) {
        reply = isHindiScript
          ? "घबराएं नहीं। मदद रास्ते में है। मैं आपके साथ बनी हुई हूँ। गहरी सांस लें।"
          : isHinglish
          ? "Dariye mat, help bilkul aane hi wali hai. Main aapke saath hoon, bilkul akele nahi hain aap. Deep breath lijiye."
          : "Help is on the way. Stay with me. Take deep breaths. I will stay right here with you.";
      } 
      // Diagnostic check-in checklist
      else {
        const questionsList = [
          isHindiScript ? "मुझे बताएं, वास्तव में क्या हुआ था?" : "Tell me, what exactly happened?",
          isHindiScript ? "घायल व्यक्ति कौन है? क्या वह बात कर सकता है?" : "Who is injured? Can they speak to you?",
          isHindiScript ? "कितने लोग घायल हुए हैं?" : "How many people are injured in total?",
          isHindiScript ? "क्या रोगी पूरी तरह होश में है?" : "Is the injured person conscious?",
          isHindiScript ? "क्या सांस सामान्य रूप से चल रही है?" : "Is their breathing normal?",
          isHindiScript ? "क्या कहीं से खून बह रहा है?" : "Is there any active bleeding?",
          isHindiScript ? "क्या घायल व्यक्ति अपने अंगों को हिला सकता है?" : "Can the person move their limbs?",
          isHindiScript ? "क्या कोई वाहन या मलबे के नीचे फंसा हुआ है?" : "Is anyone trapped?",
          isHindiScript ? "क्या आसपास का क्षेत्र सुरक्षित और सुरक्षित है?" : "Is the surrounding area safe from traffic?"
        ];

        const idx = session.currentQuestionIndex % questionsList.length;
        reply = questionsList[idx];
        session.currentQuestionIndex++;
      }
    }

    if (reply) {
      addMessage('nova', reply);
      speakText(reply);
    }
  };

  // 8. Ending / Exit Session
  const exitSession = () => {
    cancelSpeech();
    
    const endMsg = "I am glad I could stay with you. I hope the patient receives proper care. Stay safe.";
    addMessage('nova', endMsg);
    speakText(endMsg);

    // Reset Local Storage Session
    setTimeout(() => {
      setIsActivated(false);
      setMessages([]);
      localStorage.removeItem('nova_activated');
      localStorage.removeItem('nova_messages');
      chatSessionRef.current = {
        hasSubmittedReport: null,
        currentQuestionIndex: 0,
        answers: {},
      };
    }, 4000);
  };

  const handleToggleMute = () => {
    cancelSpeech();
  };

  return (
    <div className="nova-layout-container">
      {/* Back to User Dashboard button */}
      <button 
        className="nova-back-btn" 
        onClick={() => {
          cancelSpeech();
          // Reset LocalStorage completely for clean start next time
          localStorage.removeItem('nova_activated');
          localStorage.removeItem('nova_messages');
          setIsActivated(false);
          setMessages([]);
          chatSessionRef.current = {
            hasSubmittedReport: null,
            currentQuestionIndex: 0,
            answers: {},
          };
          window.location.href = '/user/dashboard';
        }}
        title="Back to Dashboard"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>Back to Dashboard</span>
      </button>

      {!isActivated ? (
        <NovaVoiceCard
          state={state}
          onMouseDown={startHoldTimer}
          onMouseUp={stopHoldTimer}
          onTouchStart={startHoldTimer}
          onTouchEnd={stopHoldTimer}
          isActivated={isActivated}
          holdProgress={holdProgress}
          isHolding={isHolding}
        />
      ) : (
        <div className="nova-dashboard">
          <div className="nova-panel-left">
            <NovaVoiceCard
              state={state}
              onMouseDown={startListening}
              onMouseUp={stopListening}
              isActivated={isActivated}
              onToggleMute={handleToggleMute}
            />
          </div>
          <div className="nova-panel-right">
            <ChatSection
              messages={messages}
              state={state}
              onExitSession={exitSession}
            />
          </div>
        </div>
      )}
    </div>
  );
}
