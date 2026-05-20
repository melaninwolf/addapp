package com.mar.addapp;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UsageTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
